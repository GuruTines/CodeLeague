package models

type Room struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	IsPrivate bool   `json:"is_private"`
	Capacity  int    `json:"capacity"`
	Link      string `json:"link"`
}

type RoomInput struct {
	Title     string `json:"title"`
	IsPrivate bool   `json:"is_private"`
	Capacity  int    `json:"capacity"`
}
