package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"project/internal/handler"
	"project/internal/middlware"
	"project/internal/models"
	"project/internal/service"
)

type RoundAPI struct {
	roundService *service.RoundService
}

func NewRoundAPI(roundService *service.RoundService) *RoundAPI {
	return &RoundAPI{
		roundService: roundService,
	}
}

func sendRoundError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, handler.ErrRoundAlreadyActive):
		handler.SendErrResponse(w, err.Error(), http.StatusConflict)

	case errors.Is(err, handler.ErrTaskNotInRoom),
		errors.Is(err, handler.ErrRoundNotFound):
		handler.SendErrResponse(w, err.Error(), http.StatusNotFound)

	case errors.Is(err, handler.ErrRoundInactive),
		errors.Is(err, handler.ErrAlreadySubmitted):
		handler.SendErrResponse(w, err.Error(), http.StatusConflict)

	case errors.Is(err, handler.ErrNotRoomMember):
		handler.SendErrResponse(w, err.Error(), http.StatusForbidden)

	default:
		handler.SendErrResponse(
			w,
			err.Error(),
			http.StatusBadRequest,
		)
	}
}

// POST /rooms/{UUID}/rounds
func (a *RoundAPI) StartRoundHandler(w http.ResponseWriter, r *http.Request) {
	var input models.StartRoundInput

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&input); err != nil {
		handler.SendErrResponse(
			w,
			"Некорректное тело запроса",
			http.StatusBadRequest,
		)
		return
	}

	roomID := r.PathValue("UUID")

	round, err := a.roundService.StartRound(roomID, input)
	if err != nil {
		sendRoundError(w, err)
		return
	}

	handler.SendJSON(w, round, http.StatusCreated)
}

// GET /rooms/{UUID}/rounds/active
func (a *RoundAPI) GetActiveRoundHandler(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("UUID")

	userID, ok := r.Context().Value(middlware.UserKeyID).(string)
	if !ok {
		handler.SendErrResponse(
			w,
			handler.Unauthorized,
			http.StatusUnauthorized,
		)
		return
	}

	round, err := a.roundService.GetActiveRound(roomID, userID)
	if err != nil {
		sendRoundError(w, err)
		return
	}

	// Отсутствие активного раунда — нормальная ситуация.
	if round == nil {
		handler.SendJSON(w, map[string]any{
			"active": false,
			"round":  nil,
		}, http.StatusOK)
		return
	}

	handler.SendJSON(w, map[string]any{
		"active": true,
		"round":  round,
	}, http.StatusOK)
}

// POST /rooms/{UUID}/rounds/{roundID}/submissions
func (a *RoundAPI) SubmitRoundHandler(w http.ResponseWriter, r *http.Request) {
	var input models.SubmitRoundInput

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&input); err != nil {
		handler.SendErrResponse(
			w,
			"Некорректное тело запроса",
			http.StatusBadRequest,
		)
		return
	}

	userID, ok := r.Context().Value(middlware.UserKeyID).(string)
	if !ok {
		handler.SendErrResponse(
			w,
			handler.Unauthorized,
			http.StatusUnauthorized,
		)
		return
	}

	submission, err := a.roundService.SubmitRound(
		r.PathValue("UUID"),
		r.PathValue("roundID"),
		userID,
		input,
	)
	if err != nil {
		sendRoundError(w, err)
		return
	}

	handler.SendJSON(w, submission, http.StatusCreated)
}
