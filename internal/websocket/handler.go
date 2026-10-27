package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"project/internal/middlware"

	gorilla "github.com/gorilla/websocket"
)

type RoomAccess interface {
	IsUserInRoom(roomID string, userID int) (bool, error)
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

var upgrader = gorilla.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}

		return origin == "http://"+r.Host ||
			origin == "https://"+r.Host
	},
}

type IncomingMessage struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
}

type OutgoingMessage struct {
	Type    string `json:"type"`
	RoomID  string `json:"room_id"`
	UserID  string `json:"user_id"`
	Payload string `json:"payload"`
}

func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
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

	client := &Client{
		RoomID: roomID,
		UserID: userID,
		Send:   make(chan []byte, 64),
	}

	h.hub.Register(client)

	h.broadcastEvent(roomID, userID, "user_joined", "")

	go h.writePump(conn, client)
	h.readPump(conn, client)
}

func (h *Handler) readPump(conn *gorilla.Conn, client *Client) {
	defer func() {
		h.hub.Unregister(client)
		conn.Close()
		h.broadcastEvent(client.RoomID, client.UserID, "user_left", "")
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

		h.broadcastEvent(
			client.RoomID,
			client.UserID,
			"chat",
			incoming.Payload,
		)
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

func (h *Handler) broadcastEvent(
	roomID string,
	userID string,
	eventType string,
	payload string,
) {
	data, err := json.Marshal(OutgoingMessage{
		Type:    eventType,
		RoomID:  roomID,
		UserID:  userID,
		Payload: payload,
	})
	if err != nil {
		log.Printf("marshal websocket event: %v", err)
		return
	}

	h.hub.Broadcast(roomID, data)
}
