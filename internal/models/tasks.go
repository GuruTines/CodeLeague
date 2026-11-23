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

// TaskParam — один параметр функции, которую пишет участник.
// Type: int | long | double | bool | string, с необязательным суффиксом [] или [][].
type TaskParam struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// TaskSignature — сигнатура функции задачи (как на LeetCode): участник реализует
// функцию Name(Params...) ReturnType, а судья вызывает её на каждом тесте.
// В тестах input — JSON-массив аргументов, expected_output — JSON возвращаемого значения.
type TaskSignature struct {
	Name       string      `json:"name"`
	Params     []TaskParam `json:"params"`
	ReturnType string      `json:"return_type"`
}

type TaskDetails struct {
	ID          int            `json:"id"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Signature   *TaskSignature `json:"signature,omitempty"`
	Samples     []TaskSample   `json:"samples"`
}
