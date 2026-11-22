package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"project/internal/middlware"

	gorilla "github.com/gorilla/websocket"
)

type RoomAccess interface {
	IsUserInRoom(roomID string, userID int) (bool, error)
	GetUsername(userID int) (string, error)
}

type Handler struct {
	hub   *Hub
	rooms RoomAccess
}

func NewHandler(hub *Hub, rooms RoomAccess) *Handler {
	return &Handler{
		hub:   hub,
		rooms: rooms,
	}
}

var defaultAllowedOrigins = []string{
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"http://10.37.201.235:5173",
	"https://10.37.201.235:5173",
}

var (
	allowedOrigins = loadAllowedOrigins()
	allowAnyOrigin = allowedOrigins["*"]
)

func loadAllowedOrigins() map[string]bool {
	result := make(map[string]bool)
	for _, origin := range defaultAllowedOrigins {
		result[strings.ToLower(origin)] = true
	}
	for _, origin := range strings.Split(os.Getenv("WS_ALLOWED_ORIGINS"), ",") {
		origin = strings.ToLower(strings.TrimSpace(origin))
		origin = strings.TrimRight(origin, "/")
		if origin != "" {
			result[origin] = true
		}
	}
	return result
}

// checkOrigin разрешает соединение, если:
//   - заголовка Origin нет (не браузер — доступ всё равно защищён cookie сессии);
//   - Origin совпадает с Host запроса (фронтенд и бэкенд на одном адресе — именно так
//     работает Vite-прокси и nginx), в том числе с X-Forwarded-Host за обратным прокси;
//   - Origin есть в списке разрешённых.
//
// Раньше принимались только четыре жёстко прописанных адреса, поэтому любой, кто открывал
// сайт по другому адресу (свой IP, имя хоста, другой порт), получал 403 на подключении к чату.
func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" || allowAnyOrigin {
		return true
	}

	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		log.Printf("WS origin rejected (invalid): origin=%q host=%q", origin, r.Host)
		return false
	}

	if strings.EqualFold(parsed.Host, r.Host) {
		return true
	}

	if forwarded := r.Header.Get("X-Forwarded-Host"); forwarded != "" {
		first := strings.TrimSpace(strings.Split(forwarded, ",")[0])
		if strings.EqualFold(parsed.Host, first) {
			return true
		}
	}

	normalized := strings.ToLower(parsed.Scheme + "://" + parsed.Host)
	if allowedOrigins[normalized] {
		return true
	}

	log.Printf("WS origin rejected: origin=%q host=%q (WS_ALLOWED_ORIGINS)", origin, r.Host)
	return false
}

var upgrader = gorilla.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     checkOrigin,
}

type IncomingMessage struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
}

type OutgoingMessage struct {
	Type     string `json:"type"`
	RoomID   string `json:"room_id"`
	UserID   string `json:"user_id"`
	Username string `json:"username,omitempty"`
	Payload  string `json:"payload"`
}

func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	log.Printf(
		"WS request: method=%s path=%s host=%s origin=%s",
		r.Method,
		r.URL.Path,
		r.Host,
		r.Header.Get("Origin"),
	)

	roomID := r.PathValue("UUID")

	userID, ok := r.Context().Value(middlware.UserKeyID).(string)
	if !ok || userID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	intUserID, err := strconv.Atoi(userID)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusUnauthorized)
		return
	}

	isMember, err := h.rooms.IsUserInRoom(roomID, intUserID)
	if err != nil {
		log.Printf("check room membership: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if !isMember {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade: %v", err)
		return
	}

	log.Println("WS connected successfully")

	username, err := h.rooms.GetUsername(intUserID)
	if err != nil {
		log.Printf("lookup username: %v", err)
	}

	client := &Client{
		RoomID:   roomID,
		UserID:   userID,
		Username: username,
		Send:     make(chan []byte, 64),
	}

	h.hub.Connect(client)

	go h.writePump(conn, client)
	h.readPump(conn, client)
}

func (h *Handler) readPump(conn *gorilla.Conn, client *Client) {
	defer func() {
		h.hub.Disconnect(client)
		conn.Close()
	}()

	conn.SetReadLimit(16 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var incoming IncomingMessage
		if err := json.Unmarshal(data, &incoming); err != nil {
			continue
		}

		if incoming.Type != "chat" {
			continue
		}

		if len(incoming.Payload) > 4000 {
			continue
		}

		h.broadcastEvent(client, "chat", incoming.Payload)
	}
}

func (h *Handler) writePump(conn *gorilla.Conn, client *Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.Send:
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = conn.WriteMessage(gorilla.CloseMessage, nil)
				return
			}

			if err := conn.WriteMessage(gorilla.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(gorilla.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Handler) broadcastEvent(client *Client, eventType string, payload string) {
	data, err := json.Marshal(OutgoingMessage{
		Type:     eventType,
		RoomID:   client.RoomID,
		UserID:   client.UserID,
		Username: client.Username,
		Payload:  payload,
	})
	if err != nil {
		log.Printf("marshal websocket event: %v", err)
		return
	}

	h.hub.Broadcast(client.RoomID, data)
}
