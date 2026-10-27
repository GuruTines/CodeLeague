package models

import "time"

type Round struct {
	ID              string     `json:"id"`
	RoomID          string     `json:"room_id"`
	TaskID          int        `json:"task_id"`
	TaskTitle       string     `json:"task_title"`
	TaskDescription string     `json:"task_description"`
	RoundStatus     string     `json:"round_status"`
	DurationSeconds int        `json:"duration_seconds"`
	StartedAt       time.Time  `json:"started_at"`
	EndedAt         *time.Time `json:"ended_at,omitempty"`
}

type StartRoundInput struct {
	TaskID          int `json:"task_id"`
	DurationSeconds int `json:"duration_seconds"`
}

type SubmitRoundInput struct {
	SourceCode string `json:"source_code"`
	Language   string `json:"language"`
}

type RoundSubmission struct {
	ID          string    `json:"id"`
	RoundID     string    `json:"round_id"`
	UserID      int       `json:"user_id"`
	SourceCode  string    `json:"source_code"`
	Language    string    `json:"language"`
	SubmittedAt time.Time `json:"submitted_at"`
}
