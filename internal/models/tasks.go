package models

type Task struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type TasksList struct {
	TasksID []int `json:"tasks_id"`
}
