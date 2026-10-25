package main

import (
	"fmt"
	"net/http"
	"project/internal/api"
	"project/internal/database/inmemory"
	"project/internal/database/postgres"
	"project/internal/service"
)

func main() {
	// БАЗЫ ДАННЫХ ПРИЛОЖЕНИЯ
	strConn := "postgres://postgres:postgres@localhost:5432/code_league"
	postgresStore, err := postgres.NewPostgresPool(strConn)
	if err != nil {
		fmt.Println("Возникла ошибка!", err)
		return
	}
	defer postgresStore.Pool.Close()

	// Инициализация подключения к БД (redis)
	// configRedis := redis.ConfigRedis{
	// 	Addr:     "127.0.0.1:6379",
	// 	Password: "",
	// 	DB:       0,
	// }
	// redisStore, err := redis.NewRedisConnect(configRedis)
	// if err != nil {
	// 	fmt.Println("Возникла ошибка!", err)
	// 	return
	// }
	inMemoryStore := inmemory.NewMemory()

	// БИЗНЕС-ЛОГИКА ПРИЛОЖЕНИЯ
	authService := service.NewAuthService(postgresStore)       // Авторизация
	sessionService := service.NewSessionService(inMemoryStore) // Сессии
	roomService := service.NewRoomService(postgresStore)       // Комнаты

	// ТРАНСПОРТНЫЙ СЛОЙ ПРИЛОЖЕНИЯ
	authAPI := api.NewAuthAPI(authService, sessionService)
	roomAPI := api.NewRoomAPI(roomService, inMemoryStore)

	http.HandleFunc("POST /register", authAPI.RegisterHandler) // Регистрация
	http.HandleFunc("POST /login", authAPI.LoginHandler)       // Вход
	http.HandleFunc("DELETE /logout", authAPI.LogoutHandler)   // Выход

	http.HandleFunc("POST /rooms", roomAPI.CreateRoomHandler)                            // Создание комнаты
	http.HandleFunc("POST /rooms/{UUID}/tasks", roomAPI.AddTasksInRoomHandler)           // Добавление задач в комнату
	http.HandleFunc("DELETE /rooms/{UUID}/tasks", roomAPI.DelTasksFromRoomHandler)       // Удаление задач из комнаты
	http.HandleFunc("PATCH /rooms/{UUID}/tasks/{taskID}", roomAPI.SetTaskSuccessHandler) // Обновление статуса is_success задачи внутри комнаты

	if err := http.ListenAndServe(":9091", nil); err != nil {
		fmt.Println("Возникла ошибка!", err)
		return
	}
}

// POSTGRES
// Зачем нужен context? (Еще и в Hanlers)
