package models

type Room struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	IsPrivate bool   `json:"is_private"`
	Capacity  int    `json:"capacity"`
	Link      string `json:"link"`
}

type RoomsList struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	IsPrivate    bool   `json:"is_private"`
	Capacity     int    `json:"capacity"`
	MembersCount int    `json:"members_count"`
	IsAdmin      bool   `json:"is_admin"`
	IsMember     bool   `json:"is_member"`
}

type RoomMember struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"is_admin"`
}

type RoomDetails struct {
	ID        string       `json:"id"`
	Title     string       `json:"title"`
	IsPrivate bool         `json:"is_private"`
	Capacity  int          `json:"capacity"`
	Members   []RoomMember `json:"members"`
	Tasks     []Task       `json:"tasks"`
}

type RoomInput struct {
	Title     string `json:"title"`
	IsPrivate bool   `json:"is_private"`
	Capacity  int    `json:"capacity"`
}
