package handler

import (
	"errors"
	"net/http"
)

var (
	ErrShortUsernameLen = errors.New("username must contain at least 3 characters")
	ErrLongUsernameLen  = errors.New("username must contain no more than 128 characters")
	ErrShortPasswordLen = errors.New("password must contain at least 8 characters")
	ErrLongPasswordLen  = errors.New("password must contain no more than 64 characters")
	ErrInvalidSymbols   = errors.New("password contains invalid characters")
	ErrLatinOnlySymbols = errors.New("password must contain only Latin characters")
	ErrAlwaysDigit      = errors.New("password must contain at least one digit")

	ErrUserExists            = errors.New("user already exists")
	ErrInvalidUsernameOrPass = errors.New("invalid username or password")
	ErrUserUnauthorized      = errors.New("user unauthorized")

	ErrRecordNotFound    = errors.New("record not found")
	ErrTaskNotFound      = errors.New("task not found")
	ErrTasksAlreadyAdded = errors.New("tasks already added")
	ErrTasksListEmpty    = errors.New("task list is empty")
	ErrMaxCapacity       = errors.New("no place in room")

	ErrRoundNotFound      = errors.New("раунд не найден")
	ErrRoundInactive      = errors.New("раунд уже завершён или время истекло")
	ErrNotRoomMember      = errors.New("пользователь не состоит в комнате")
	ErrAlreadySubmitted   = errors.New("решение уже отправлено")
	ErrTaskNotInRoom      = errors.New("задача не добавлена в комнату")
	ErrRoundAlreadyActive = errors.New("в комнате уже идёт раунд")
	ErrNoRoundSubmissions = errors.New("не удалось сохранить решение")
)

const (
	PasswordInvalid     = "Пароль невалиден!"
	RegisterUserError   = "Ошибка при регистрации пользователя!"
	NoRightsThisAction  = "Нет прав для этого действия!"
	ShortTitleLen       = "Название должно содержать не меньше 3 символов!"
	LongTitleLen        = "Название должно содержать не больше 128 символов!"
	MinRoomCapacity     = "Вместимость комнаты не должна быть меньше 1!"
	MaxRoomCapacity     = "Вместимость комнаты не должна быть больше 15!"
	AddTaskError        = "Ошибка добавления задачи!"
	SetTaskStatusError  = "Ошибка изменения статуса задачи!"
	DeleteTaskError     = "Ошибка удаления задачи!"
	InternalServerError = "Внутренняя ошибка сервера!"
	Unauthorized        = "Пользователь не авторизован! Зарегистрируйтесь или войдите в аккаунт!"
)

func GetErrorResponse(err error) (string, int) {
	switch {
	case errors.Is(err, ErrShortUsernameLen),
		errors.Is(err, ErrLongUsernameLen),
		errors.Is(err, ErrShortPasswordLen),
		errors.Is(err, ErrLongPasswordLen),
		errors.Is(err, ErrInvalidSymbols),
		errors.Is(err, ErrLatinOnlySymbols),
		errors.Is(err, ErrAlwaysDigit),
		errors.Is(err, ErrTasksListEmpty):
		return PasswordInvalid, http.StatusBadRequest

	case errors.Is(err, ErrUserExists):
		return RegisterUserError, http.StatusConflict

	case errors.Is(err, ErrInvalidUsernameOrPass),
		errors.Is(err, ErrUserUnauthorized):
		return Unauthorized, http.StatusUnauthorized

	case errors.Is(err, ErrRecordNotFound),
		errors.Is(err, ErrTaskNotFound),
		errors.Is(err, ErrTaskNotInRoom),
		errors.Is(err, ErrRoundNotFound):
		return "Запись не найдена!", http.StatusNotFound

	case errors.Is(err, ErrTasksAlreadyAdded),
		errors.Is(err, ErrRoundAlreadyActive),
		errors.Is(err, ErrAlreadySubmitted),
		errors.Is(err, ErrRoundInactive):
		return "Операция конфликтует с текущим состоянием ресурса!", http.StatusConflict

	case errors.Is(err, ErrNotRoomMember):
		return "Пользователь не состоит в комнате!", http.StatusForbidden

	case errors.Is(err, ErrMaxCapacity):
		return "В комнате нет места!", http.StatusBadRequest

	case errors.Is(err, ErrNoRoundSubmissions):
		return "Не удалось сохранить решение!", http.StatusInternalServerError

	default:
		return InternalServerError, http.StatusInternalServerError
	}
}
