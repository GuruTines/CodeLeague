package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type ErrResponse struct {
	Message    string    `json:"message"`
	StatusCode int       `json:"status_code"`
	CreatedAt  time.Time `json:"created_at"`
}

func SendErrResponse(w http.ResponseWriter, message string, statusCode int) {
	errResponse := ErrResponse{
		Message:    message,
		StatusCode: statusCode,
		CreatedAt:  time.Now().UTC(),
	}

	// Marshal - работает с готовым набором байт
	// В отличие от Encoder, который передает данные пакетами через Writer
	// Поэтому для чтения -> Decoder, поскольку с http приходит поток
	// Для записи Marhal
	responseByte, err := json.Marshal(errResponse)
	if err != nil {
		// Не возвращаем ошибку!
		// Если ошибка произошла в обертке,
		// то лучше напрямую передать ее через обертку
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Внутренняя ошибка сервера!"))
		return
	}

	w.WriteHeader(statusCode)
	_, err = w.Write(responseByte)
	// Если Write() отдал ошибку, то вероятнее всего
	// соединение разорвано, а значит писать ответ некуда!
	// Не нужно снова делать WriteHeader и Write
	// Достаточно залогировать и return
	if err != nil {
		fmt.Println("Ошибка передачи сообщения:", err)
		return
	}
}

func SendJSON(w http.ResponseWriter, data any, statusCode int) {
	responseByte, err := json.Marshal(data)
	if err != nil {
		SendErrResponse(w, "Внутренняя ошибка сервера!", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(statusCode)
	_, err = w.Write(responseByte)
	if err != nil {
		fmt.Println("Ошибка передачи сообщения:", err)
		return
	}
}
