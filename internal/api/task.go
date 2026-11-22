package api

import (
	"fmt"
	"net/http"
	"project/internal/handler"
	"project/internal/service"
	"strconv"
)

type TaskAPI struct {
	taskService *service.TaskService
}

func NewTaskAPI(taskService *service.TaskService) *TaskAPI {
	return &TaskAPI{
		taskService: taskService,
	}
}

func (ts *TaskAPI) GetTaskHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		handler.SendErrResponse(w, "Некорректный ID задачи", http.StatusBadRequest)
		return
	}

	task, err := ts.taskService.GetTask(id)
	if err != nil {
		fmt.Println(err)
		errResponse, errCode := handler.GetErrorResponse(err)
		handler.SendErrResponse(w, errResponse, errCode)
		return
	}

	handler.SendJSON(w, task, http.StatusOK)
}

func (ts *TaskAPI) GetAllTasksHandler(
	w http.ResponseWriter,
	r *http.Request,
) {
	tasks, err := ts.taskService.GetAllTasks()
	if err != nil {
		fmt.Println(err)

		errResponse, errCode := handler.GetErrorResponse(err)
		handler.SendErrResponse(w, errResponse, errCode)
		return
	}

	handler.SendJSON(w, tasks, http.StatusOK)
}
