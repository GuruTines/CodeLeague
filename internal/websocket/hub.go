package websocket

import (
	"sync"
)

type Client struct {
	RoomID string
	UserID string
	Send   chan []byte
}

type Message struct {
	RoomID string
	Data   []byte
}

type Hub struct {
	mu sync.RWMutex

	rooms map[string]map[*Client]bool

	register   chan *Client
	unregister chan *Client
	broadcast  chan Message
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan Message, 256),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()

			if h.rooms[client.RoomID] == nil {
				h.rooms[client.RoomID] = make(map[*Client]bool)
			}

			h.rooms[client.RoomID][client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()

			if clients, ok := h.rooms[client.RoomID]; ok {
				if clients[client] {
					delete(clients, client)
					close(client.Send)
				}

				if len(clients) == 0 {
					delete(h.rooms, client.RoomID)
				}
			}

			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.RLock()

			for client := range h.rooms[message.RoomID] {
				select {
				case client.Send <- message.Data:
				default:
					go func(c *Client) {
						h.unregister <- c
					}(client)
				}
			}

			h.mu.RUnlock()
		}
	}
}

func (h *Hub) Register(client *Client) {
	h.register <- client
}

func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

func (h *Hub) Broadcast(roomID string, data []byte) {
	h.broadcast <- Message{
		RoomID: roomID,
		Data:   data,
	}
}
