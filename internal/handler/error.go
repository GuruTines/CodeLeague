package handler

var (
	// User
	ShortUsernameLen = "Имя пользователя должно содержать не меньше 3 символов!"
	LongUsernameLen  = "Имя пользователя должно содержать не больше 128 символов!"

	ShortPasswordLen = "Пароль должен содержать не меньше 8 символов!"
	LongPasswordLen  = "Пароль должен содержать не больше 64 символов!"
	NotValidSymbols  = "Пароль содержит недопустимые символы!"
	OnlyLatinSymbol  = "Пароль должен содержать только латинские символы!"
	AlwaysDigit      = "Пароль должен содержать хотя бы одну цифру!"

	UserNowExists      = "Пользователь уже существует!"
	UserNotExists      = "Неверное имя пользователя или пароль!"
	PasswordCheckError = "Возникла ошибка при проверке пароля!"

	// Rooms
	WriteNotExists  = "Записи не существует!"
	ShortTitleLen   = "Название должно содержать не меньше 3 символов!"
	LongTitleLen    = "Название должно содержать не больше 128 символов!"
	MinRoomCapacity = "Вместимость комнаты не должна быть меньше 1!"
	MaxRoomCapacity = "Вместимость комнаты не должна быть больше 15!"

	// Tasks
	TasksListIsEmpty   = "Список задач пуст!"
	TasksNotExists     = "Задачи не существует!"
	TasksExists        = "Задачи уже добавлены!"
	SetTaskStatusError = "Ошибка изменения статуса задачи!"

	// Сторонние ошибки
	InternalServerError = "Внутрення ошибка сервера!"
	RegisterUserError   = "Ошибка при регистрации пользователя!"
)
