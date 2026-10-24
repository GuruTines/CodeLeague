package service

import (
	"github.com/google/uuid"
)

type SessionStorage interface {
	CreateSession(UUID string, userID any) error
	GetSessionByUUID(UUID string) (string, error)
	DeleteSessionByUUID(UUID string) error
}

type SessionService struct {
	db SessionStorage
}

func NewSessionService(db SessionStorage) *SessionService {
	return &SessionService{
		db: db,
	}
}

func (s *SessionService) CreateSession(userID int) (string, error) {
	// Создаем UUID как ключ для записи в Redis
	uuid := uuid.New().String()

	// Получаем данные пользоватаеля с БД
	// При register/login БД выполняет запрос и заполняет структуру models.User
	// CreateSession должен будет вызываться на высоком уровне API, чтобы не ходить в БД 2 раза
	if err := s.db.CreateSession(uuid, userID); err != nil {
		return uuid, err
	}

	return uuid, nil
}

func (s *SessionService) DeleteSession(UUID string) error {
	if err := s.db.DeleteSessionByUUID(UUID); err != nil {
		return err
	}

	return nil
}
