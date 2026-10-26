package middlware

import (
	"context"
	"net/http"
	"project/internal/handler"
)

type contextKey string

const UserKeyID contextKey = "userID"

type SessionStorage interface {
	GetSessionByUUID(UUID string) (string, error)
}

type AuthMiddlware struct {
	AuthStorage SessionStorage
}

func NewAuthMiddlware(db SessionStorage) *AuthMiddlware {
	return &AuthMiddlware{
		AuthStorage: db,
	}
}

func (a *AuthMiddlware) AuthMiddlwareWrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_token")
		if err != nil {
			handler.SendErrResponse(w, handler.Unauthorized, http.StatusUnauthorized)
			return
		}

		// Получаем id сессии из cookie
		sessionID := cookie.Value

		// Поиск id пользователя в redis
		userID, err := a.AuthStorage.GetSessionByUUID(sessionID)
		if err != nil {
			handler.SendErrResponse(w, handler.Unauthorized, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserKeyID, userID)
		r = r.WithContext(ctx)

		next.ServeHTTP(w, r)
	})
}
