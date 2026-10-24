package postgres

import (
	"context"
	"errors"
	"fmt"
	"project/internal/handler"
	"project/internal/models"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (p *PostgresStore) CreateRoom(userID int, room models.RoomInput) (*models.Room, error) {
	var roomResult models.Room

	tx, err := p.Pool.Begin(context.Background())
	if err != nil {
		fmt.Println(err)
		return nil, err
	}
	defer tx.Rollback(context.Background())

	insertRoomQuery := `INSERT INTO rooms (title, is_private, capacity)
	VALUES ($1, $2, $3)
	RETURNING id, title, is_private, capacity;`

	insertAdminQuery := `INSERT INTO users_rooms (user_id, room_id, is_admin)
	VALUES ($1, $2, $3);`

	if err := tx.QueryRow(context.Background(), insertRoomQuery, room.Title, room.IsPrivate, room.Capacity).Scan(
		&roomResult.ID,
		&roomResult.Title,
		&roomResult.IsPrivate,
		&roomResult.Capacity,
	); err != nil {
		return nil, err
	}

	if _, err := tx.Exec(context.Background(), insertAdminQuery, userID, roomResult.ID, true); err != nil {
		return nil, err
	}

	if err = tx.Commit(context.Background()); err != nil {
		if errors.Is(err, pgx.ErrTxCommitRollback) {
			fmt.Println(err)
			return nil, fmt.Errorf("Произошел откат!\n%v", err)
		}
		fmt.Println(err)
		return nil, err
	}

	return &roomResult, nil
}

func (p *PostgresStore) AddTasksInRoom(roomUUID string, tasksList models.TasksList) ([]models.Task, error) {
	var task models.Task
	var tasksResult []models.Task
	var pgErr *pgconn.PgError

	tx, err := p.Pool.Begin(context.Background())
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())

	insertQuery := `INSERT INTO rooms_tasks (room_id, task_id)
	SELECT $1, unnest($2::INT[]);`

	selectQuery := `SELECT tasks.id, tasks.title, tasks.description FROM tasks
	JOIN rooms_tasks ON tasks.id = rooms_tasks.task_id
	WHERE rooms_tasks.room_id = $1;`

	_, err = tx.Exec(context.Background(), insertQuery, roomUUID, tasksList.TasksID)
	if err != nil {
		if errors.As(err, &pgErr) {
			// Нарушение FK
			if pgErr.Code == "23503" {
				fmt.Println(err)
				return nil, errors.New(handler.TasksNotExists)
			}
			// Нарушение PK
			if pgErr.Code == "23505" {
				fmt.Println(err)
				return nil, errors.New(handler.TasksExists)
			}
		}

		return nil, err
	}

	rows, err := tx.Query(context.Background(), selectQuery, roomUUID)
	if err != nil {
		fmt.Println(err)
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		if err := rows.Scan(&task.ID,
			&task.Title,
			&task.Description); err != nil {
			fmt.Println(err)
			return nil, err
		}

		tasksResult = append(tasksResult, task)
	}

	if err = rows.Err(); err != nil {
		fmt.Println(err)
		return nil, fmt.Errorf("Возникла ошибка при чтении или выполнении запроса!\n%v", err)
	}

	if err = tx.Commit(context.Background()); err != nil {
		if errors.Is(err, pgx.ErrTxCommitRollback) {
			fmt.Println(err)
			return nil, fmt.Errorf("Произошел откат!\n%v", err)
		}
		fmt.Println(err)
		return nil, err
	}

	return tasksResult, nil
}

func (p *PostgresStore) DelTasksFromRoom(roomUUID string, tasksList models.TasksList) error {
	query := `DELETE FROM rooms_tasks
 	WHERE room_id = $1 AND task_id = ANY($2::INT[]);`

	if _, err := p.Pool.Exec(context.Background(), query, roomUUID, tasksList.TasksID); err != nil {
		fmt.Println(err)
		return err
	}

	return nil
}

func (p *PostgresStore) SetTaskSuccessRoom(roomUUID string, taskID int) error {
	var pgErr *pgconn.PgError

	query := `UPDATE rooms_tasks SET is_success = true
	WHERE room_id = $1 AND task_id = $2;`

	if _, err := p.Pool.Exec(context.Background(), query, roomUUID, taskID); err != nil {
		// Нарушение FK
		if errors.As(err, &pgErr) {
			if pgErr.Code == "23503" {
				fmt.Println(err)
				return errors.New(handler.TasksNotExists)
			}
			return errors.New("Необработанная ошибка pgErr")
		}

		return errors.New(handler.SetTaskStatusError)
	}

	return nil
}
