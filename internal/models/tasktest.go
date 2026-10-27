package models

type TaskTest struct {
	ID             int    `json:"id"`
	TaskID         int    `json:"task_id"`
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
	IsSample       bool   `json:"is_sample"`
	Position       int    `json:"position"`
}
