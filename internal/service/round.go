package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"project/internal/judgeclient"

	"project/internal/handler"
	"project/internal/models"
)

type RoundStorage interface {
	CreateRound(roomID string, taskID int, durationSeconds int) (*models.Round, error)
	GetActiveRound(roomID string) (*models.Round, error)
	IsUserInRoom(roomID string, userID int) (bool, error)
	SubmitRound(roomID string, roundID string, userID int, input models.SubmitRoundInput) (*models.RoundSubmission, error)
	GetRoundSubmissions(roomID string, roundID string) ([]models.RoundSubmission, error)
	GetTaskTests(taskID int) ([]models.TaskTest, error)
	UpdateSubmissionResult(submissionID string, verdict string, passedTests int, totalTests int, executionTimeMS int, memoryUsedKB int, compileOutput string) error
	FinishRound(roundID string) (bool, error)
	GetSubmittedUserIDs(roundID string) ([]int, error)
}

type Realtime interface {
	OnlineUserIDs(roomID string) []int
	BroadcastEvent(roomID, eventType, payload string)
}

type RoundService struct {
	db    RoundStorage
	judge *judgeclient.Client
	rt    Realtime
}

func NewRoundService(db RoundStorage, judge *judgeclient.Client, rt Realtime) *RoundService {
	return &RoundService{
		db:    db,
		judge: judge,
		rt:    rt,
	}
}

func (s *RoundService) StartRound(roomID string, input models.StartRoundInput) (*models.Round, error) {
	if input.TaskID <= 0 {
		return nil, errors.New("некорректный ID задачи")
	}

	if input.DurationSeconds < 30 || input.DurationSeconds > 7200 {
		return nil, errors.New("длительность раунда должна быть от 30 до 7200 секунд")
	}

	round, err := s.db.CreateRound(roomID, input.TaskID, input.DurationSeconds)
	if err != nil {
		return nil, err
	}

	s.ScheduleRoundFinish(round.RoomID, round.ID, round.DurationSeconds)

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

	round, err := s.db.GetActiveRound(roomID)
	if err != nil {
		return nil, err
	}
	if round == nil || round.ID != roundID {
		return nil, handler.ErrRoundInactive
	}

	// Решение можно сдать один раз, поэтому задачу без сигнатуры отклоняем до его сохранения.
	if round.TaskSignature == nil {
		return nil, errors.New("у задачи не задана сигнатура функции (tasks.signature)")
	}
	signature := judgeclient.Signature{
		Name:       round.TaskSignature.Name,
		Params:     make([]judgeclient.Param, 0, len(round.TaskSignature.Params)),
		ReturnType: round.TaskSignature.ReturnType,
	}
	for _, p := range round.TaskSignature.Params {
		signature.Params = append(signature.Params, judgeclient.Param{Name: p.Name, Type: p.Type})
	}

	submission, err := s.db.SubmitRound(
		roomID,
		roundID,
		intUserID,
		input,
	)
	if err != nil {
		fmt.Println("Ошибка в SubmitRound", err)
		return nil, err
	}

	defer s.finishIfAllOnlineSubmitted(roomID, roundID, intUserID)

	taskTests, err := s.db.GetTaskTests(round.TaskID)
	if err != nil {
		fmt.Println("Ошибка в GetTaskTests", err)
		return submission, err
	}

	tests := make([]judgeclient.TestCase, 0, len(taskTests))
	for _, test := range taskTests {
		tests = append(tests, judgeclient.TestCase{
			Input:          test.Input,
			ExpectedOutput: test.ExpectedOutput,
		})
	}

	judgeReq := judgeclient.Request{
		Language:           input.Language,
		SourceCode:         input.SourceCode,
		Signature:          signature,
		Tests:              tests,
		TimeLimitMS:        2000,
		MemoryLimitMB:      256,
		StopOnFirstFailure: false,
	}

	result, err := s.judge.Judge(context.Background(), judgeReq)
	if err != nil {
		// Решение уже сохранено, а попытка одна: без вердикта участник увидел бы пустоту.
		// Подробности — в лог, участнику — понятный вердикт «ошибка проверки».
		log.Printf("Judge не проверил решение %s (задача %d): %v", submission.ID, round.TaskID, err)
		submission.Verdict = "JUDGE_ERROR"
		submission.TotalTests = len(tests)
		submission.CompileOutput = "Сервис проверки не смог обработать решение. Сообщите администратору."
		if updErr := s.db.UpdateSubmissionResult(
			submission.ID, submission.Verdict, 0, submission.TotalTests, 0, 0, submission.CompileOutput,
		); updErr != nil {
			log.Printf("Не удалось сохранить вердикт JUDGE_ERROR для %s: %v", submission.ID, updErr)
		}
		return submission, nil
	}

	err = s.db.UpdateSubmissionResult(
		submission.ID,
		result.Verdict,
		result.Passed,
		result.Total,
		result.TimeMS,
		result.MemoryKB,
		result.CompileOutput,
	)
	if err != nil {
		fmt.Println("Ошибка в UpdateSubmissionResult", err)
		return submission, err
	}

	submission.Verdict = result.Verdict
	submission.PassedTests = result.Passed
	submission.TotalTests = result.Total
	submission.ExecutionTimeMS = result.TimeMS
	submission.MemoryUsedKB = result.MemoryKB
	submission.CompileOutput = result.CompileOutput

	return submission, nil
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

func (s *RoundService) ScheduleRoundFinish(roomID string, roundID string, durationSeconds int) {
	time.AfterFunc(time.Duration(durationSeconds)*time.Second, func() {
		s.finishRound(roomID, roundID)
	})
}

func (s *RoundService) finishRound(roomID, roundID string) {
	changed, err := s.db.FinishRound(roundID)
	if err != nil {
		log.Println("Не удалось завершить раунд:", err)
		return
	}
	if changed && s.rt != nil {
		s.rt.BroadcastEvent(roomID, "round_finished", roundID)
	}
}

func (s *RoundService) finishIfAllOnlineSubmitted(roomID, roundID string, extraOnline ...int) {
	if s.rt == nil {
		return
	}

	waiting := make(map[int]struct{})
	for _, id := range s.rt.OnlineUserIDs(roomID) {
		waiting[id] = struct{}{}
	}
	for _, id := range extraOnline {
		waiting[id] = struct{}{}
	}
	if len(waiting) == 0 {
		return
	}

	submitted, err := s.db.GetSubmittedUserIDs(roundID)
	if err != nil {
		log.Println("Не удалось получить список сдавших:", err)
		return
	}
	for _, id := range submitted {
		delete(waiting, id)
	}
	if len(waiting) > 0 {
		return
	}

	s.finishRound(roomID, roundID)
}

func (s *RoundService) OnUserOffline(roomID string, _ int) {
	round, err := s.db.GetActiveRound(roomID)
	if err != nil {
		log.Println("Не удалось получить активный раунд:", err)
		return
	}
	if round == nil {
		return
	}
	s.finishIfAllOnlineSubmitted(roomID, round.ID)
}
