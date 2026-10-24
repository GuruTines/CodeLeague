package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"project/internal/handler"
	"project/internal/models"
	"project/internal/service"
)

type AuthAPI struct {
	authService    *service.AuthService
	sessionService *service.SessionService
}

func NewAuthAPI(authService *service.AuthService, sessionService *service.SessionService) *AuthAPI {
	return &AuthAPI{
		authService:    authService,
		sessionService: sessionService,
	}
}

func (a *AuthAPI) RegisterHandler(w http.ResponseWriter, r *http.Request) {
	// Создание объекта User для передачи в бизнес-логику
	var user models.UserInput

	// Создаем объект decoder и записываем данные в User
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&user); err != nil {
		fmt.Println(err)
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Вызов функции регистрации
	userResult, err := a.authService.Register(user)
	if err != nil {
		fmt.Println("Ошибка RegisterHandler:", err)
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Вызов функции записи сессии в Redis
	uuid, err := a.sessionService.CreateSession(userResult.ID)
	if err != nil {
		fmt.Println("Ошибка RegisterHandler:", err)
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    uuid,
		Path:     "/",
		MaxAge:   3600 * 24 * 7,
		HttpOnly: true,
		Secure:   true,
	})

	handler.SendJSON(w, userResult, http.StatusCreated)
}

func (a *AuthAPI) LoginHandler(w http.ResponseWriter, r *http.Request) {
	var user models.UserInput

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&user); err != nil {
		fmt.Println("Ошибка LoginHandler:", err)
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	userResult, err := a.authService.Login(user)
	if err != nil {
		fmt.Println("Ошибка LoginHandler:", err)
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Вызов функции записи сессии в Redis
	uuid, err := a.sessionService.CreateSession(userResult.ID)
	if err != nil {
		fmt.Println("Ошибка RegisterHandler:", err)
		handler.SendErrResponse(w, err.Error(), http.StatusBadRequest)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    uuid,
		Path:     "/",
		MaxAge:   3600 * 24 * 7,
		HttpOnly: true,
		Secure:   true,
	})

	handler.SendJSON(w, userResult, http.StatusOK)
}

func (a *AuthAPI) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_token")
	if err != nil {
		fmt.Println("Ошибка получения cookie", err)
		handler.SendErrResponse(w, err.Error(), http.StatusUnauthorized)
	}

	uuid := cookie.Value
	if err := a.sessionService.DeleteSession(uuid); err != nil {
		fmt.Println("Ошибка LogoutHandler", err)
		handler.SendErrResponse(w, err.Error(), http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    uuid,
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
	})

	handler.SendJSON(w, nil, http.StatusOK)
}
