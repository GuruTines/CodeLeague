package main

import (
	"fmt"
	"net/http"
	"os"
	"project/internal/api"
	"project/internal/database/postgres"
	"project/internal/database/redis"
	"project/internal/judgeclient"
	"project/internal/middlware"
	"project/internal/service"
	"project/internal/websocket"
)

func main() {
	// БАЗЫ ДАННЫХ ПРИЛОЖЕНИЯ
	strConn := os.Getenv("DATABASE_URL")
	if strConn == "" {
		strConn = "postgres://postgres:postgres@localhost:5432/code_league?sslmode=disable"
	}
	postgresStore, err := postgres.NewPostgresPool(strConn)
	if err != nil {
		fmt.Println("Возникла ошибка!", err)
		return
	}
	defer postgresStore.Pool.Close()

	// Инициализация подключения к БД (redis)
	redisAddr := os.Getenv("REDIS_ADDR")
	configRedis := redis.ConfigRedis{
		Addr:     redisAddr,
		Password: "",
		DB:       0,
	}
	redisStore, err := redis.NewRedisConnect(configRedis)
	if err != nil {
		fmt.Println("Возникла ошибка!", err)
		return
	}
	defer redisStore.Conn.Close()
	// inMemoryStore := inmemory.NewMemory()

	// Инициализация подключения к rust
	judgeBaseURL := os.Getenv("JUDGE_BASE_URL")
	if judgeBaseURL == "" {
		judgeBaseURL = "http://localhost:8081"
	}
	judge := judgeclient.NewClient(
		judgeBaseURL,
		os.Getenv("JUDGE_API_TOKEN"),
	)

	// MIDDLWARE
	authMid := middlware.NewAuthMiddlware(redisStore)
	accessMid := middlware.NewAccessMiddlware(postgresStore)

	// WEBSOCKET-ХАБ
	wsHub := websocket.NewHub()
	go wsHub.Run()

	// БИЗНЕС-ЛОГИКА ПРИЛОЖЕНИЯ
	authService := service.NewAuthService(postgresStore)                 // Авторизация
	sessionService := service.NewSessionService(redisStore)              // Сессии
	roomService := service.NewRoomService(postgresStore)                 // Комнаты
	roundService := service.NewRoundService(postgresStore, judge, wsHub) // Раунды
	taskService := service.NewTaskService(postgresStore)                 // Задачи

	// ТРАНСПОРТНЫЙ СЛОЙ ПРИЛОЖЕНИЯ
	authAPI := api.NewAuthAPI(authService, sessionService)
	roomAPI := api.NewRoomAPI(roomService)
	roundAPI := api.NewRoundAPI(roundService)
	taskAPI := api.NewTaskAPI(taskService)

	// WEBSOCKET
	wsHub.SetOnOffline(roundService.OnUserOffline)
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
	http.Handle("GET /rooms", authMid.AuthMiddlwareWrap(http.HandlerFunc(roomAPI.GetAllRoomsHandler)))                                                           // открытые комнаты
	http.Handle("GET /me/rooms", authMid.AuthMiddlwareWrap(http.HandlerFunc(roomAPI.GetMyRoomsHandler)))                                                         // мои комнаты
	http.Handle("GET /rooms/{UUID}", authMid.AuthMiddlwareWrap(http.HandlerFunc(roomAPI.GetRoomHandler)))                                                        // данные комнаты (только участникам)

	// ЗАДАЧИ
	http.Handle("GET /tasks", authMid.AuthMiddlwareWrap(http.HandlerFunc(taskAPI.GetAllTasksHandler))) // Получить список задач
	http.Handle("GET /tasks/{id}", authMid.AuthMiddlwareWrap(http.HandlerFunc(taskAPI.GetTaskHandler)))

	// РАУНДЫ
	// Создать раунд — только администратор комнаты
	http.Handle("POST /rooms/{UUID}/rounds", authMid.AuthMiddlwareWrap(accessMid.AccessMiddlwareWrap(http.HandlerFunc(roundAPI.StartRoundHandler))))

	// Получить активный раунд — участник комнаты
	http.Handle("GET /rooms/{UUID}/rounds/active", authMid.AuthMiddlwareWrap(http.HandlerFunc(roundAPI.GetActiveRoundHandler)))

	// Отправить решение — участник комнаты
	http.Handle("POST /rooms/{UUID}/rounds/{roundID}/submissions", authMid.AuthMiddlwareWrap(http.HandlerFunc(roundAPI.SubmitRoundHandler)))

	// Получить решения участников раунда
	http.Handle("GET /rooms/{UUID}/rounds/{roundID}/submissions", authMid.AuthMiddlwareWrap(http.HandlerFunc(roundAPI.GetRoundSubmissionsHandler)))

	// WEBSOCKET КОМНАТЫ
	http.Handle("GET /rooms/{UUID}/ws", authMid.AuthMiddlwareWrap(http.HandlerFunc(wsHandler.ServeWS)))

	if err := http.ListenAndServe(":9091", nil); err != nil {
		fmt.Println("Возникла ошибка!", err)
		return
	}
}
