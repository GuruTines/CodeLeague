package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"project/internal/handler"
	"project/internal/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (p *PostgresStore) CreateRound(roomID string, taskID, durationSeconds int) (*models.Round, error) {
	ctx := context.Background()
	roundID := uuid.NewString()
	query := `WITH inserted AS (
    INSERT INTO rounds (id, room_id, task_id, round_status, duration_seconds)
    SELECT $1, rt.room_id, rt.task_id, 'active', $4
    FROM rooms_tasks rt
    WHERE rt.room_id = $2 AND rt.task_id = $3
    RETURNING id, room_id, task_id, round_status, duration_seconds, started_at, ended_at)
	SELECT i.id, i.room_id, i.task_id, t.title, t.description,
		i.round_status, i.duration_seconds, i.started_at, i.ended_at
	FROM inserted i
	JOIN tasks t ON t.id = i.task_id;`

	var round models.Round
	err := p.Pool.QueryRow(ctx, query, roundID, roomID, taskID, durationSeconds).Scan(
		&round.ID,
		&round.RoomID,
		&round.TaskID,
		&round.TaskTitle,
		&round.TaskDescription,
		&round.RoundStatus,
		&round.DurationSeconds,
		&round.StartedAt,
		&round.EndedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, handler.ErrRoundAlreadyActive
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, handler.ErrTaskNotInRoom
		}
		return nil, err
	}
	return &round, nil
}

func (p *PostgresStore) GetActiveRound(roomID string) (*models.Round, error) {
	ctx := context.Background()
	_, err := p.Pool.Exec(ctx, `UPDATE rounds SET round_status = 'finished', ended_at = NOW()
		WHERE room_id = $1 AND round_status = 'active'
		AND started_at + duration_seconds * INTERVAL '1 second' <= NOW();`, roomID)
	if err != nil {
		return nil, err
	}
	query := `SELECT r.id, r.room_id, r.task_id, t.title, t.description, r.round_status,
		r.duration_seconds, r.started_at, r.ended_at
		FROM rounds r JOIN tasks t ON t.id = r.task_id
		WHERE r.room_id = $1 AND r.round_status = 'active' LIMIT 1;`
	var round models.Round
	err = p.Pool.QueryRow(ctx, query, roomID).Scan(
		&round.ID, &round.RoomID, &round.TaskID, &round.TaskTitle,
		&round.TaskDescription, &round.RoundStatus, &round.DurationSeconds,
		&round.StartedAt, &round.EndedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &round, nil
}

func (p *PostgresStore) IsUserInRoom(roomID string, userID int) (bool, error) {
	var isMember bool
	err := p.Pool.QueryRow(context.Background(), `SELECT EXISTS (
		SELECT 1 FROM users_rooms WHERE room_id = $1 AND user_id = $2
	);`, roomID, userID).Scan(&isMember)
	return isMember, err
}

func (p *PostgresStore) SubmitRound(roomID, roundID string, userID int, input models.SubmitRoundInput) (*models.RoundSubmission, error) {
	ctx := context.Background()
	tx, err := p.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var activeRoundID string
	err = tx.QueryRow(ctx, `SELECT id FROM rounds
		WHERE id = $1 AND room_id = $2 AND round_status = 'active'
		AND started_at + duration_seconds * INTERVAL '1 second' > NOW()
		FOR UPDATE;`, roundID, roomID).Scan(&activeRoundID)
	if errors.Is(err, pgx.ErrNoRows) {
		_, updateErr := tx.Exec(ctx, `UPDATE rounds SET round_status = 'finished', ended_at = NOW()
			WHERE id = $1 AND room_id = $2 AND round_status = 'active'
			AND started_at + duration_seconds * INTERVAL '1 second' <= NOW();`, roundID, roomID)
		if updateErr != nil {
			return nil, updateErr
		}
		var roundExists bool
		err = tx.QueryRow(ctx, `SELECT EXISTS (
			SELECT 1 FROM rounds WHERE id = $1 AND room_id = $2
		);`, roundID, roomID).Scan(&roundExists)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		if !roundExists {
			return nil, handler.ErrRoundNotFound
		}
		return nil, handler.ErrRoundInactive
	}
	if err != nil {
		return nil, err
	}

	var isMember bool
	err = tx.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM users_rooms WHERE room_id = $1 AND user_id = $2
	);`, roomID, userID).Scan(&isMember)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, handler.ErrNotRoomMember
	}

	submission := models.RoundSubmission{
		ID: uuid.NewString(), RoundID: roundID, UserID: userID,
		SourceCode: input.SourceCode, Language: input.Language,
	}
	err = tx.QueryRow(ctx, `INSERT INTO round_submissions (id, round_id, user_id, source_code, language)
		VALUES ($1, $2, $3, $4, $5) RETURNING submitted_at;`,
		submission.ID, submission.RoundID, submission.UserID, submission.SourceCode, submission.Language,
	).Scan(&submission.SubmittedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, handler.ErrAlreadySubmitted
		}
		return nil, err
	}

	var memberCount, submissionCount int
	err = tx.QueryRow(ctx, `SELECT COUNT(*) FROM users_rooms WHERE room_id = $1;`, roomID).Scan(&memberCount)
	if err != nil {
		return nil, err
	}
	err = tx.QueryRow(ctx, `SELECT COUNT(*) FROM round_submissions WHERE round_id = $1;`, roundID).Scan(&submissionCount)
	if err != nil {
		return nil, err
	}
	if memberCount > 0 && submissionCount >= memberCount {
		_, err = tx.Exec(ctx, `UPDATE rounds SET round_status = 'finished', ended_at = NOW()
			WHERE id = $1 AND round_status = 'active';`, roundID)
		if err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &submission, nil
}

func (p *PostgresStore) FinishRound(roundID string) error {
	_, err := p.Pool.Exec(context.Background(), `UPDATE rounds
		SET round_status = 'finished', ended_at = NOW()
		WHERE id = $1 AND round_status = 'active';`, roundID)
	if err != nil {
		return fmt.Errorf("finish round: %w", err)
	}
	return nil
}

func (p *PostgresStore) ScheduleRoundFinish(roundID string, durationSeconds int) {
	time.AfterFunc(time.Duration(durationSeconds)*time.Second, func() {
		if err := p.FinishRound(roundID); err != nil {
			fmt.Println("Не удалось завершить раунд:", err)
		}
	})
}

func (p *PostgresStore) GetRoundSubmissions(roomID, roundID string) ([]models.RoundSubmission, error) {
	ctx := context.Background()

	var exists bool
	err := p.Pool.QueryRow(ctx, `
        SELECT EXISTS (
            SELECT 1 FROM rounds
            WHERE id = $1 AND room_id = $2
        );
    `, roundID, roomID).Scan(&exists)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, handler.ErrRoundNotFound
	}

	rows, err := p.Pool.Query(ctx, `
        SELECT id, round_id, user_id, source_code, language, submitted_at
        FROM round_submissions
        WHERE round_id = $1
        ORDER BY submitted_at ASC;
    `, roundID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	submissions := make([]models.RoundSubmission, 0)
	for rows.Next() {
		var submission models.RoundSubmission
		if err := rows.Scan(
			&submission.ID,
			&submission.RoundID,
			&submission.UserID,
			&submission.SourceCode,
			&submission.Language,
			&submission.SubmittedAt,
		); err != nil {
			return nil, err
		}
		submissions = append(submissions, submission)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return submissions, nil
}
