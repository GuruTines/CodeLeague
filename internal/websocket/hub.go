package websocket

import (
	"encoding/json"
	"log"
	"sort"
	"strconv"
	"sync"
	"time"
)

const defaultPresenceGrace = 5 * time.Second

type Client struct {
	RoomID   string
	UserID   string
	Username string
	Send     chan []byte
}

type Message struct {
	RoomID string
	Data   []byte
}

type presence struct {
	username string
	conns    int
	gen      int
	timer    *time.Timer
}

type Hub struct {
	mu sync.RWMutex

	rooms map[string]map[*Client]bool

	pmu       sync.Mutex
	online    map[string]map[string]*presence
	grace     time.Duration
	onOffline func(roomID string, userID int)

	broadcast chan Message
}

func NewHub() *Hub {
	return &Hub{
		rooms:     make(map[string]map[*Client]bool),
		online:    make(map[string]map[string]*presence),
		grace:     defaultPresenceGrace,
		broadcast: make(chan Message, 256),
	}
}

func (h *Hub) SetOnOffline(fn func(roomID string, userID int)) {
	h.pmu.Lock()
	h.onOffline = fn
	h.pmu.Unlock()
}

func (h *Hub) Run() {
	for message := range h.broadcast {
		var slow []*Client

		h.mu.RLock()
		for client := range h.rooms[message.RoomID] {
			select {
			case client.Send <- message.Data:
			default:
				slow = append(slow, client)
			}
		}
		h.mu.RUnlock()

		for _, client := range slow {
			h.Unregister(client)
		}
	}
}

func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.rooms[client.RoomID] == nil {
		h.rooms[client.RoomID] = make(map[*Client]bool)
	}
	h.rooms[client.RoomID][client] = true
}

func (h *Hub) Unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	clients, ok := h.rooms[client.RoomID]
	if !ok {
		return
	}
	if clients[client] {
		delete(clients, client)
		close(client.Send)
	}
	if len(clients) == 0 {
		delete(h.rooms, client.RoomID)
	}
}

func (h *Hub) Broadcast(roomID string, data []byte) {
	h.broadcast <- Message{
		RoomID: roomID,
		Data:   data,
	}
}

func (h *Hub) BroadcastEvent(roomID, eventType, payload string) {
	h.publish(roomID, eventType, "", "", payload)
}

func (h *Hub) Connect(client *Client) {
	h.Register(client)

	h.pmu.Lock()
	users := h.online[client.RoomID]
	if users == nil {
		users = make(map[string]*presence)
		h.online[client.RoomID] = users
	}
	p := users[client.UserID]
	isNew := p == nil
	if isNew {
		p = &presence{username: client.Username}
		users[client.UserID] = p
	}
	if p.timer != nil {
		p.timer.Stop()
		p.timer = nil
	}
	p.gen++
	p.conns++
	h.pmu.Unlock()

	if isNew {
		h.publish(client.RoomID, "user_joined", client.UserID, client.Username, "")
	}
	h.broadcastPresence(client.RoomID)
}

func (h *Hub) Disconnect(client *Client) {
	h.Unregister(client)

	h.pmu.Lock()
	defer h.pmu.Unlock()

	p := h.online[client.RoomID][client.UserID]
	if p == nil {
		return
	}
	if p.conns > 0 {
		p.conns--
	}
	if p.conns > 0 {
		return
	}

	p.gen++
	gen := p.gen
	roomID, userID := client.RoomID, client.UserID
	p.timer = time.AfterFunc(h.grace, func() { h.expire(roomID, userID, p, gen) })
}

func (h *Hub) expire(roomID, userID string, p *presence, gen int) {
	h.pmu.Lock()
	users := h.online[roomID]
	if users == nil || users[userID] != p || p.conns > 0 || p.gen != gen {
		h.pmu.Unlock()
		return
	}
	delete(users, userID)
	if len(users) == 0 {
		delete(h.online, roomID)
	}
	username := p.username
	onOffline := h.onOffline
	h.pmu.Unlock()

	h.publish(roomID, "user_left", userID, username, "")
	h.broadcastPresence(roomID)

	if onOffline != nil {
		if id, err := strconv.Atoi(userID); err == nil {
			onOffline(roomID, id)
		}
	}
}

func (h *Hub) OnlineUserIDs(roomID string) []int {
	h.pmu.Lock()
	defer h.pmu.Unlock()

	ids := make([]int, 0, len(h.online[roomID]))
	for userID := range h.online[roomID] {
		if id, err := strconv.Atoi(userID); err == nil {
			ids = append(ids, id)
		}
	}
	sort.Ints(ids)
	return ids
}

func (h *Hub) broadcastPresence(roomID string) {
	payload, err := json.Marshal(h.OnlineUserIDs(roomID))
	if err != nil {
		log.Printf("marshal presence: %v", err)
		return
	}
	h.publish(roomID, "presence", "", "", string(payload))
}

func (h *Hub) publish(roomID, eventType, userID, username, payload string) {
	data, err := json.Marshal(OutgoingMessage{
		Type:     eventType,
		RoomID:   roomID,
		UserID:   userID,
		Username: username,
		Payload:  payload,
	})
	if err != nil {
		log.Printf("marshal websocket event: %v", err)
		return
	}
	h.Broadcast(roomID, data)
}
