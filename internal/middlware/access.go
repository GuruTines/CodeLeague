package middlware

import (
	"fmt"
	"net/http"
	"project/internal/handler"
)

type UserStorage interface {
	IsAdminInRoom(roomUUID string, userID string) (bool, error)
}

type AccessMiddlware struct {
	accessStorage UserStorage
}

func NewAccessMiddlware(db UserStorage) *AccessMiddlware {
	return &AccessMiddlware{
		accessStorage: db,
	}
}

func (a *AccessMiddlware) AccessMiddlwareWrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		roomUUID := r.PathValue("UUID")
		userID, ok := r.Context().Value(UserKeyID).(string)
		if !ok {
			fmt.Println("AccessMiddlwareWrap1")
			handler.SendErrResponse(w, handler.Unauthorized, http.StatusUnauthorized)
			return
		}

		isAdmin, err := a.accessStorage.IsAdminInRoom(roomUUID, userID)
		if err != nil {
			fmt.Println("AccessMiddlwareWrap2", err)
			errResponse, errCode := handler.GetErrorResponse(err)
			handler.SendErrResponse(w, errResponse, errCode)
			return
		}

		if !isAdmin {
			fmt.Println("AccessMiddlwareWrap no admin")
			handler.SendErrResponse(w, handler.NoRightsThisAction, http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}
