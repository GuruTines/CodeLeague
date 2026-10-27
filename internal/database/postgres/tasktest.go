package postgres

import (
	"context"

	"project/internal/models"
)

func (p *PostgresStore) GetTaskTests(taskID int) ([]models.TaskTest, error) {
	query := `
        SELECT id, task_id, input, expected_output, is_sample, position
        FROM task_tests
        WHERE task_id = $1
        ORDER BY position, id;
    `

	rows, err := p.Pool.Query(
		context.Background(),
		query,
		taskID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tests := make([]models.TaskTest, 0)

	for rows.Next() {
		var test models.TaskTest

		err := rows.Scan(
			&test.ID,
			&test.TaskID,
			&test.Input,
			&test.ExpectedOutput,
			&test.IsSample,
			&test.Position,
		)
		if err != nil {
			return nil, err
		}

		tests = append(tests, test)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return tests, nil
}
