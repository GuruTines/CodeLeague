package models

type Task struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	IsSuccess   bool   `json:"is_success"`
}

type TasksList struct {
	TasksID []int `json:"tasks_id"`
}

type TaskSample struct {
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
}

type TaskDetails struct {
	ID          int          `json:"id"`
	Title       string       `json:"title"`
	Description string       `json:"description"`
	Samples     []TaskSample `json:"samples"`
}
