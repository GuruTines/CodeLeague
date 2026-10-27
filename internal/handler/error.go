package handler

import (
	"errors"
	"net/http"
)

// Ошибки валидации пользователя
var (
	ErrShortUsernameLen = errors.New("username must contain at least 3 characters")
	ErrLongUsernameLen  = errors.New("username must contain no more than 128 characters")

	ErrShortPasswordLen = errors.New("password must contain at least 8 characters")
	ErrLongPasswordLen  = errors.New("password must contain no more than 64 characters")

	ErrInvalidSymbols   = errors.New("password contains invalid characters")
	ErrLatinOnlySymbols = errors.New("password must contain only Latin characters")
	ErrAlwaysDigit      = errors.New("password must contain at least one digit")
)

// Ошибки авторизации и регистрации
var (
	ErrUserExists            = errors.New("user already exists")
	ErrInvalidUsernameOrPass = errors.New("invalid username or password")
	ErrUserUnauthorized      = errors.New("user unauthorized")
)

// Ошибки комнат и задач
var (
	ErrRecordNotFound    = errors.New("record not found")
	ErrTaskNotFound      = errors.New("task not found")
	ErrTasksAlreadyAdded = errors.New("tasks already added")
	ErrTasksListEmpty    = errors.New("task list is empty")
	ErrMaxCapacity       = errors.New("no place in room")
)

// Сообщения для HTTP-ответов
const (
	PasswordInvalid   = "Пароль невалиден!"
	RegisterUserError = "Ошибка при регистрации пользователя!"

	NoRightsThisAction = "Нет прав для этого действия!"

	ShortTitleLen   = "Название должно содержать не меньше 3 символов!"
	LongTitleLen    = "Название должно содержать не больше 128 символов!"
	MinRoomCapacity = "Вместимость комнаты не должна быть меньше 1!"
	MaxRoomCapacity = "Вместимость комнаты не должна быть больше 15!"

	AddTaskError       = "Ошибка добавления задачи!"
	SetTaskStatusError = "Ошибка изменения статуса задачи!"
	DeleteTaskError    = "Ошибка удаления задачи!"

	InternalServerError = "Внутренняя ошибка сервера!"
	Unauthorized        = "Пользователь не авторизован! Зарегистрируйтесь или войдите в аккаунт!"
)

func GetErrorResponse(err error) (string, int) {
	switch {
	// Ошибки валидации пользователя
	case errors.Is(err, ErrShortUsernameLen),
		errors.Is(err, ErrLongUsernameLen),
		errors.Is(err, ErrShortPasswordLen),
		errors.Is(err, ErrLongPasswordLen),
		errors.Is(err, ErrInvalidSymbols),
		errors.Is(err, ErrLatinOnlySymbols),
		errors.Is(err, ErrAlwaysDigit):
		return PasswordInvalid, http.StatusBadRequest

	// Ошибки регистрации и авторизации
	case errors.Is(err, ErrUserExists):
		return RegisterUserError, http.StatusConflict

	case errors.Is(err, ErrInvalidUsernameOrPass):
		return Unauthorized, http.StatusUnauthorized

	case errors.Is(err, ErrUserUnauthorized):
		return Unauthorized, http.StatusUnauthorized

	// Ошибки комнат и задач
	case errors.Is(err, ErrRecordNotFound),
		errors.Is(err, ErrTaskNotFound):
		return "Запись не найдена!", http.StatusNotFound

	case errors.Is(err, ErrTasksAlreadyAdded):
		return "Задачи уже добавлены!", http.StatusConflict

	case errors.Is(err, ErrTasksListEmpty):
		return "Список задач пуст!", http.StatusBadRequest

	case errors.Is(err, ErrMaxCapacity):
		return "В комнате нет места!", http.StatusBadRequest

	default:
		return InternalServerError, http.StatusInternalServerError
	}
}
