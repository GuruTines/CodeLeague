package service

import (
	"errors"
	"fmt"
	"project/internal/handler"
	"project/internal/models"
	"strconv"
	"unicode/utf8"
)

type RoomStorage interface {
	CreateRoom(userID int, room models.RoomInput) (*models.Room, error)
	DelRoom(roomUUID string) error
	AddTasksInRoom(roomUUID string, tasksList models.TasksList) ([]models.Task, error)
	DelTasksFromRoom(roomUUID string, tasksList models.TasksList) error
	SetTaskSuccessRoom(roomUUID string, taskID int) error
	AddUserInRoom(roomUUID string, userID int) error
}

type RoomService struct {
	db RoomStorage
}

func NewRoomService(db RoomStorage) *RoomService {
	return &RoomService{
		db: db,
	}
}

func (rm *RoomService) CreateRoom(userID string, room models.RoomInput) (*models.Room, error) {
	if utf8.RuneCountInString(room.Title) < 3 {
		return nil, errors.New(handler.ShortTitleLen)
	}

	if utf8.RuneCountInString(room.Title) > 128 {
		return nil, errors.New(handler.LongTitleLen)
	}

	if room.Capacity < 1 {
		return nil, errors.New(handler.MinRoomCapacity)
	}

	if room.Capacity > 15 {
		return nil, errors.New(handler.MaxRoomCapacity)
	}

	intUserID, err := strconv.Atoi(userID)
	if err != nil {
		return nil, errors.New(handler.InternalServerError)
	}

	// Вызов метода CreateRoom слоя базы данных
	// UUID задачи генерируется в БД!
	roomResult, err := rm.db.CreateRoom(intUserID, room)
	if err != nil {
		return nil, err
	}

	roomResult.Link = "localhost:9091/rooms/" + roomResult.ID + "/users"

	return roomResult, nil
}

func (rm *RoomService) DelRoom(roomUUID string) error {
	if err := rm.db.DelRoom(roomUUID); err != nil {
		return err
	}

	return nil
}

func (rm *RoomService) AddTasksInRoom(roomUUID string, tasksList models.TasksList) ([]models.Task, error) {
	if len(tasksList.TasksID) == 0 {
		fmt.Println("Список задач пуст!")
		return nil, handler.ErrTasksListEmpty
	}

	// Вызов метода для добавления задач
	// в таблицу связи rooms_tasks
	tasks, err := rm.db.AddTasksInRoom(roomUUID, tasksList)
	if err != nil {
		return nil, err
	}

	return tasks, nil
}

func (rm *RoomService) DelTasksFromRoom(roomUUID string, tasksList models.TasksList) error {
	if len(tasksList.TasksID) == 0 {
		fmt.Println("Список задач пуст!")
		return handler.ErrTasksListEmpty
	}

	err := rm.db.DelTasksFromRoom(roomUUID, tasksList)
	if err != nil {
		fmt.Println(err)
		return err
	}

	return nil
}

func (rm *RoomService) SetTaskSuccess(roomUUID string, taskID string) error {
	intTaskID, err := strconv.Atoi(taskID)
	if err != nil {
		fmt.Println(err)
		return err
	}

	if err := rm.db.SetTaskSuccessRoom(roomUUID, intTaskID); err != nil {
		fmt.Println(err)
		return err
	}

	return nil
}

func (rm *RoomService) AddUserInRoom(roomUUID string, userID string) error {
	intUserID, err := strconv.Atoi(userID)
	if err != nil {
		return err
	}

	err = rm.db.AddUserInRoom(roomUUID, intUserID)
	if err != nil {
		return err
	}

	return nil
}
