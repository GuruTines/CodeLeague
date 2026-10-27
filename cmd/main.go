package main

import (
	"fmt"
	"net/http"
	"project/internal/api"
	"project/internal/database/inmemory"
	"project/internal/database/postgres"
	"project/internal/middlware"
	"project/internal/service"
	"project/internal/websocket"
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

	// MIDDLWARE
	authMid := middlware.NewAuthMiddlware(inMemoryStore)
	accessMid := middlware.NewAccessMiddlware(postgresStore)

	// БИЗНЕС-ЛОГИКА ПРИЛОЖЕНИЯ
	authService := service.NewAuthService(postgresStore)       // Авторизация
	sessionService := service.NewSessionService(inMemoryStore) // Сессии
	roomService := service.NewRoomService(postgresStore)       // Комнаты
	roundService := service.NewRoundService(postgresStore)     // Раунды

	// ТРАНСПОРТНЫЙ СЛОЙ ПРИЛОЖЕНИЯ
	authAPI := api.NewAuthAPI(authService, sessionService)
	roomAPI := api.NewRoomAPI(roomService)
	roundAPI := api.NewRoundAPI(roundService)

	// WEBSOCKET
	wsHub := websocket.NewHub()
	go wsHub.Run()
	wsHandler := websocket.NewHandler(wsHub, postgresStore)

	// АВТОРИЗАЦИЯ
	http.HandleFunc("POST /register", authAPI.RegisterHandler) // Регистрация
	http.HandleFunc("POST /login", authAPI.LoginHandler)       // Вход
	http.HandleFunc("DELETE /logout", authAPI.LogoutHandler)   // Выход

	// КОМНАТЫ
	http.Handle("POST /rooms", authMid.AuthMiddlwareWrap(http.HandlerFunc(roomAPI.CreateRoomHandler)))                                                           // Создание комнаты
	http.Handle("DELETE /rooms/{UUID}", authMid.AuthMiddlwareWrap(accessMid.AccessMiddlwareWrap(http.HandlerFunc(roomAPI.DelRoomHandler))))                      // Удаление комнаты
	http.Handle("POST /rooms/{UUID}/tasks", authMid.AuthMiddlwareWrap(accessMid.AccessMiddlwareWrap(http.HandlerFunc(roomAPI.AddTasksInRoomHandler))))           // Добавление задач в комнату
	http.Handle("DELETE /rooms/{UUID}/tasks", authMid.AuthMiddlwareWrap(accessMid.AccessMiddlwareWrap(http.HandlerFunc(roomAPI.DelTasksFromRoomHandler))))       // Удаление задач из комнаты
	http.Handle("PATCH /rooms/{UUID}/tasks/{taskID}", authMid.AuthMiddlwareWrap(accessMid.AccessMiddlwareWrap(http.HandlerFunc(roomAPI.SetTaskSuccessHandler)))) // Обновление статуса is_success задачи внутри комнаты
	http.Handle("POST /rooms/{UUID}/users", authMid.AuthMiddlwareWrap(http.HandlerFunc(roomAPI.AddUserInRoomHandler)))                                           // Добавление пользователя в комнату

	// РАУНДЫ
	// Создать раунд — только администратор комнаты
	http.Handle("POST /rooms/{UUID}/rounds", authMid.AuthMiddlwareWrap(accessMid.AccessMiddlwareWrap(http.HandlerFunc(roundAPI.StartRoundHandler))))

	// Получить активный раунд — участник комнаты
	http.Handle("GET /rooms/{UUID}/rounds/active", authMid.AuthMiddlwareWrap(http.HandlerFunc(roundAPI.GetActiveRoundHandler)))

	// Отправить решение — участник комнаты
	http.Handle("POST /rooms/{UUID}/rounds/{roundID}/submissions", authMid.AuthMiddlwareWrap(http.HandlerFunc(roundAPI.SubmitRoundHandler)))

	// WEBSOCKET КОМНАТЫ
	http.Handle("GET /rooms/{UUID}/ws", authMid.AuthMiddlwareWrap(http.HandlerFunc(wsHandler.ServeWS)))

	if err := http.ListenAndServe(":9091", nil); err != nil {
		fmt.Println("Возникла ошибка!", err)
		return
	}
}

// 1) Обработать ошибки
