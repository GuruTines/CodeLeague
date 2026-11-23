package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"project/internal/handler"
	"project/internal/models"

	"github.com/jackc/pgx/v5"
)

func (p *PostgresStore) GetTask(id int) (*models.TaskDetails, error) {
	ctx := context.Background()
	task := models.TaskDetails{Samples: make([]models.TaskSample, 0)}

	var rawSignature []byte
	err := p.Pool.QueryRow(ctx,
		`SELECT id, title, description, signature FROM tasks WHERE id = $1;`, id,
	).Scan(&task.ID, &task.Title, &task.Description, &rawSignature)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, handler.ErrTaskNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get task: %w", err)
	}
	if task.Signature, err = decodeSignature(rawSignature); err != nil {
		return nil, fmt.Errorf("get task: %w", err)
	}

	rows, err := p.Pool.Query(ctx, `
		SELECT input, expected_output FROM task_tests
		WHERE task_id = $1 AND is_sample = true
		ORDER BY position, id;`, id)
	if err != nil {
		return nil, fmt.Errorf("get task samples: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var s models.TaskSample
		if err := rows.Scan(&s.Input, &s.ExpectedOutput); err != nil {
			return nil, fmt.Errorf("scan task sample: %w", err)
		}
		task.Samples = append(task.Samples, s)
	}

	return &task, rows.Err()
}

func (p *PostgresStore) GetAllTasks() ([]models.Task, error) {
	query := `
		SELECT id, title, description
		FROM tasks
		ORDER BY id;
	`

	rows, err := p.Pool.Query(context.Background(), query)
	if err != nil {
		return nil, fmt.Errorf("get all tasks: %w", err)
	}
	defer rows.Close()

	tasks := make([]models.Task, 0)

	for rows.Next() {
		var task models.Task

		if err := rows.Scan(
			&task.ID,
			&task.Title,
			&task.Description,
		); err != nil {
			return nil, fmt.Errorf("scan task: %w", err)
		}

		tasks = append(tasks, task)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate tasks: %w", err)
	}

	return tasks, nil
}

// decodeSignature разбирает JSONB-колонку tasks.signature. NULL (задача ещё не
// переведена на формат «функция») даёт nil без ошибки.
func decodeSignature(raw []byte) (*models.TaskSignature, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var sig models.TaskSignature
	if err := json.Unmarshal(raw, &sig); err != nil {
		return nil, fmt.Errorf("decode task signature: %w", err)
	}
	return &sig, nil
}
