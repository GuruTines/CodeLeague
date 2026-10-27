package postgres

import (
	"context"
	"errors"
	"fmt"
	"project/internal/handler"
	"project/internal/models"

	"github.com/jackc/pgx/v5/pgconn"
)

func (p *PostgresStore) CreateRoom(userID int, room models.RoomInput) (*models.Room, error) {
	var roomResult models.Room
	var pgErr *pgconn.PgError

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
		if errors.As(err, &pgErr) {
			// Нарушение Check
			if pgErr.Code == "23514" {
				return nil, handler.ErrMaxCapacity
			}
		}
		return nil, err
	}

	if _, err := tx.Exec(context.Background(), insertAdminQuery, userID, roomResult.ID, true); err != nil {
		return nil, err
	}

	if err = tx.Commit(context.Background()); err != nil {
		fmt.Println(err)
		return nil, err
	}

	return &roomResult, nil
}

func (p *PostgresStore) DelRoom(roomUUID string) error {
	tx, err := p.Pool.Begin(context.Background())
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())

	queryDelRoomsTasks := `DELETE FROM rooms_tasks
	WHERE room_id = $1;`

	queryDelUsersRooms := `DELETE FROM users_rooms
	WHERE room_id = $1;`

	queryDelRoom := `DELETE FROM rooms
	WHERE id = $1;`

	_, err = tx.Exec(context.Background(), queryDelRoomsTasks, roomUUID)
	if err != nil {
		fmt.Println("DelRoom1", err)
		return err
	}

	_, err = tx.Exec(context.Background(), queryDelUsersRooms, roomUUID)
	if err != nil {
		fmt.Println("DelRoom2", err)
		return err
	}

	cmdTag, err := tx.Exec(context.Background(), queryDelRoom, roomUUID)
	if err != nil {
		fmt.Println("DelRoom3", err)
		return err
	}
	if cmdTag.RowsAffected() == 0 {
		return handler.ErrRecordNotFound
	}

	if err = tx.Commit(context.Background()); err != nil {
		fmt.Println("DelRoom Commit", err)
		return err
	}

	return nil
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
				return nil, handler.ErrRecordNotFound
			}
			// Нарушение PK
			if pgErr.Code == "23505" {
				fmt.Println(err)
				return nil, handler.ErrTasksAlreadyAdded
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
		return nil, err
	}

	if err = tx.Commit(context.Background()); err != nil {
		fmt.Println(err)
		return nil, err
	}

	return tasksResult, nil
}

func (p *PostgresStore) DelTasksFromRoom(roomUUID string, tasksList models.TasksList) error {
	query := `DELETE FROM rooms_tasks
 	WHERE room_id = $1 AND task_id = ANY($2::INT[]);`

	cmdTag, err := p.Pool.Exec(context.Background(), query, roomUUID, tasksList.TasksID)
	if err != nil {
		fmt.Println(err)
		return err
	}

	if cmdTag.RowsAffected() == 0 {
		return handler.ErrTaskNotFound
	}

	return nil
}

func (p *PostgresStore) SetTaskSuccessRoom(roomUUID string, taskID int) error {
	query := `UPDATE rooms_tasks SET is_success = true
	WHERE room_id = $1 AND task_id = $2;`

	if _, err := p.Pool.Exec(context.Background(), query, roomUUID, taskID); err != nil {
		fmt.Println("SetTaskSuccessRoom", err)
		return err
	}

	return nil
}

func (p *PostgresStore) IsAdminInRoom(roomUUID string, userID string) (bool, error) {
	var isAdmin bool

	query := `SELECT is_admin FROM users_rooms
	WHERE room_id = $1 AND user_id = $2;`

	if err := p.Pool.QueryRow(context.Background(), query, roomUUID, userID).Scan(&isAdmin); err != nil {
		fmt.Println("IsAdminInRoom", err)
		return false, err
	}

	return isAdmin, nil
}

func (p *PostgresStore) AddUserInRoom(roomUUID string, userID int) error {
	tx, err := p.Pool.Begin(context.Background())
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())

	queryLockRaw := `SELECT COUNT(user_id) FROM users_rooms
	WHERE room_id = $1;`

	queryInsertUser := `INSERT INTO users_rooms (user_id, room_id)
	SELECT $1, id FROM rooms
	WHERE id = $2 AND capacity > (SELECT COUNT(*) FROM users_rooms WHERE room_id = $2);`

	if _, err := tx.Exec(context.Background(), queryLockRaw, roomUUID); err != nil {
		fmt.Println("AddUserInRoom1", err)
		return err
	}

	cmdTag, err := tx.Exec(context.Background(), queryInsertUser, userID, roomUUID)
	if err != nil {
		fmt.Println("AddUserInRoom2", err)
		return err
	}
	if cmdTag.RowsAffected() == 0 {
		return handler.ErrMaxCapacity
	}

	if err := tx.Commit(context.Background()); err != nil {
		fmt.Println("AddUserInRoom commit", err)
		return err
	}

	return nil
}
