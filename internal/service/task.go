package service

import (
	"project/internal/models"
)

type TaskStorage interface {
	GetAllTasks() ([]models.Task, error)
	GetTask(id int) (*models.TaskDetails, error)
}

type TaskService struct {
	db TaskStorage
}

func NewTaskService(db TaskStorage) *TaskService {
	return &TaskService{
		db: db,
	}
}

func (ts *TaskService) GetAllTasks() ([]models.Task, error) {
	return ts.db.GetAllTasks()
}

func (ts *TaskService) GetTask(id int) (*models.TaskDetails, error) {
	return ts.db.GetTask(id)
}
