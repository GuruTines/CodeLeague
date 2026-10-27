package service

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"project/internal/handler"
	"project/internal/models"
)

type RoundStorage interface {
	CreateRound(roomID string, taskID int, durationSeconds int) (*models.Round, error)
	GetActiveRound(roomID string) (*models.Round, error)
	IsUserInRoom(roomID string, userID int) (bool, error)
	SubmitRound(roomID string, roundID string, userID int, input models.SubmitRoundInput) (*models.RoundSubmission, error)
	ScheduleRoundFinish(roundID string, durationSeconds int)
	GetRoundSubmissions(roomID string, roundID string) ([]models.RoundSubmission, error)
}

type RoundService struct {
	db RoundStorage
}

func NewRoundService(db RoundStorage) *RoundService {
	return &RoundService{db: db}
}

func (s *RoundService) StartRound(roomID string, input models.StartRoundInput) (*models.Round, error) {
	if input.TaskID <= 0 {
		return nil, errors.New("некорректный ID задачи")
	}

	if input.DurationSeconds < 30 || input.DurationSeconds > 7200 {
		return nil, errors.New(
			"длительность раунда должна быть от 30 до 7200 секунд",
		)
	}

	round, err := s.db.CreateRound(
		roomID,
		input.TaskID,
		input.DurationSeconds,
	)
	if err != nil {
		return nil, err
	}

	s.db.ScheduleRoundFinish(
		round.ID,
		round.DurationSeconds,
	)

	return round, nil
}

func (s *RoundService) GetActiveRound(roomID string, userID string) (*models.Round, error) {
	intUserID, err := strconv.Atoi(userID)
	if err != nil {
		return nil, errors.New("некорректный ID пользователя")
	}

	isMember, err := s.db.IsUserInRoom(roomID, intUserID)
	if err != nil {
		return nil, err
	}

	if !isMember {
		return nil, handler.ErrNotRoomMember
	}

	return s.db.GetActiveRound(roomID)
}

func (s *RoundService) SubmitRound(roomID string, roundID string, userID string, input models.SubmitRoundInput) (*models.RoundSubmission, error) {
	intUserID, err := strconv.Atoi(userID)
	if err != nil {
		return nil, errors.New("некорректный ID пользователя")
	}

	if strings.TrimSpace(input.SourceCode) == "" {
		return nil, errors.New("исходный код не может быть пустым")
	}

	if len(input.SourceCode) > 100_000 {
		return nil, errors.New("исходный код слишком большой")
	}

	if strings.TrimSpace(input.Language) == "" {
		return nil, errors.New("не указан язык программирования")
	}

	if len(input.Language) > 30 {
		return nil, errors.New("название языка слишком длинное")
	}

	return s.db.SubmitRound(
		roomID,
		roundID,
		intUserID,
		input,
	)
}

func (s *RoundService) RoundDuration(startedAt time.Time, durationSeconds int) time.Duration {
	remaining := time.Duration(durationSeconds)*time.Second -
		time.Since(startedAt)

	if remaining < 0 {
		return 0
	}

	return remaining
}

func (s *RoundService) GetRoundSubmissions(roomID, roundID, userID string) ([]models.RoundSubmission, error) {
	intUserID, err := strconv.Atoi(userID)
	if err != nil {
		return nil, errors.New("некорректный ID пользователя")
	}

	isMember, err := s.db.IsUserInRoom(roomID, intUserID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, handler.ErrNotRoomMember
	}

	return s.db.GetRoundSubmissions(roomID, roundID)
}
