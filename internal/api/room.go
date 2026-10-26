package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"project/internal/handler"
	"project/internal/middlware"
	"project/internal/models"
	"project/internal/service"
)

type RoomAPI struct {
	roomService *service.RoomService
}

func NewRoomAPI(roomService *service.RoomService) *RoomAPI {
	return &RoomAPI{
		roomService: roomService,
	}
}

func (rm *RoomAPI) CreateRoomHandler(w http.ResponseWriter, r *http.Request) {
	var room models.RoomInput

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&room); err != nil {
		fmt.Println(err)
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Получаем id из контекста middlware
	userID := r.Context().Value(middlware.UserKeyID).(string)

	// Вызов метода CreateRoom сервисного слоя
	roomResult, err := rm.roomService.CreateRoom(userID, room)
	if err != nil {
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	handler.SendJSON(w, roomResult, http.StatusCreated)
}

func (rm *RoomAPI) AddTasksInRoomHandler(w http.ResponseWriter, r *http.Request) {
	var tasksList models.TasksList

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&tasksList); err != nil {
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	roomUUID := r.PathValue("UUID")

	// Вызов метода для создания записей
	// в таблице связи rooms_tasks
	tasks, err := rm.roomService.AddTasksInRoom(roomUUID, tasksList)
	if err != nil {
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	handler.SendJSON(w, tasks, http.StatusOK)
}

func (rm *RoomAPI) DelTasksFromRoomHandler(w http.ResponseWriter, r *http.Request) {
	var roomTasks models.TasksList

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&roomTasks); err != nil {
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	roomUUID := r.PathValue("UUID")

	// Вызов метода для удаления записей
	// в таблице связи rooms_tasks
	err := rm.roomService.DelTasksFromRoom(roomUUID, roomTasks)
	if err != nil {
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	handler.SendJSON(w, nil, http.StatusNoContent)
}

func (rm *RoomAPI) SetTaskSuccessHandler(w http.ResponseWriter, r *http.Request) {
	roomUUID := r.PathValue("UUID")
	taskID := r.PathValue("taskID")

	if err := rm.roomService.SetTaskSuccess(roomUUID, taskID); err != nil {
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	handler.SendJSON(w, nil, http.StatusNoContent)
}
