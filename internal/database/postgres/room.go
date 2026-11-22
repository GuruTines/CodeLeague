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

	selectQuery := `SELECT tasks.id, tasks.title, tasks.description, rooms_tasks.is_success FROM tasks
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
			&task.Description,
			&task.IsSuccess); err != nil {
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
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		fmt.Println("IsAdminInRoom", err)
		return false, err
	}

	return isAdmin, nil
}

func (p *PostgresStore) AddUserInRoom(roomUUID string, userID int) error {
	ctx := context.Background()

	tx, err := p.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Блокируем строку комнаты, чтобы два одновременных вступления
	// не заняли одно и то же последнее место.
	var capacity int
	err = tx.QueryRow(ctx, `SELECT capacity FROM rooms WHERE id = $1 FOR UPDATE;`, roomUUID).Scan(&capacity)
	if errors.Is(err, pgx.ErrNoRows) {
		return handler.ErrRecordNotFound
	}
	if err != nil {
		var pgErr *pgconn.PgError
		// Нарушение формата UUID — такой комнаты точно нет
		if errors.As(err, &pgErr) && pgErr.Code == "22P02" {
			return handler.ErrRecordNotFound
		}
		fmt.Println("AddUserInRoom1", err)
		return err
	}

	// Если пользователь уже в комнате, вступление считается успешным (идемпотентно),
	// иначе повторный клик по «Присоединиться» заканчивался ошибкой 500.
	var alreadyMember bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM users_rooms WHERE room_id = $1 AND user_id = $2
	);`, roomUUID, userID).Scan(&alreadyMember); err != nil {
		fmt.Println("AddUserInRoom2", err)
		return err
	}
	if alreadyMember {
		return nil
	}

	var members int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM users_rooms WHERE room_id = $1;`, roomUUID).Scan(&members); err != nil {
		fmt.Println("AddUserInRoom3", err)
		return err
	}
	if members >= capacity {
		return handler.ErrMaxCapacity
	}

	if _, err := tx.Exec(ctx, `INSERT INTO users_rooms (user_id, room_id) VALUES ($1, $2);`, userID, roomUUID); err != nil {
		fmt.Println("AddUserInRoom4", err)
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		fmt.Println("AddUserInRoom commit", err)
		return err
	}

	return nil
}

// GetAllRooms возвращает ВСЕ открытые (непубличные не попадают) комнаты — один и тот же
// набор для любого пользователя. Для текущего пользователя дополнительно отмечается,
// создал ли он комнату (is_admin) и состоит ли в ней (is_member), чтобы интерфейс мог
// показать пометку «Создана вами» вместо того, чтобы прятать такие комнаты.
func (p *PostgresStore) GetAllRooms(userID int) ([]models.RoomsList, error) {
	query := `SELECT
		r.id,
		r.title,
		r.is_private,
		r.capacity,
		(SELECT COUNT(*) FROM users_rooms m WHERE m.room_id = r.id)::int AS members_count,
		COALESCE(me.is_admin, false) AS is_admin,
		(me.user_id IS NOT NULL) AS is_member
	FROM rooms r
	LEFT JOIN users_rooms me
		ON me.room_id = r.id AND me.user_id = $1
	WHERE r.is_private = false
	ORDER BY r.title, r.id;`

	rows, err := p.Pool.Query(context.Background(), query, userID)
	if err != nil {
		fmt.Println(err)
		return nil, err
	}
	defer rows.Close()

	rooms := make([]models.RoomsList, 0)
	for rows.Next() {
		var room models.RoomsList
		if err := rows.Scan(
			&room.ID,
			&room.Title,
			&room.IsPrivate,
			&room.Capacity,
			&room.MembersCount,
			&room.IsAdmin,
			&room.IsMember,
		); err != nil {
			fmt.Println(err)
			return nil, err
		}
		rooms = append(rooms, room)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return rooms, nil
}

func (p *PostgresStore) GetUsername(userID int) (string, error) {
	var username string
	err := p.Pool.QueryRow(
		context.Background(),
		`SELECT username FROM users WHERE id = $1;`,
		userID,
	).Scan(&username)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return username, err
}

func (p *PostgresStore) GetRoom(roomUUID string, userID int) (*models.RoomDetails, error) {
	ctx := context.Background()

	var room models.RoomDetails
	err := p.Pool.QueryRow(ctx, `SELECT id, title, is_private, capacity FROM rooms WHERE id = $1;`, roomUUID).Scan(
		&room.ID,
		&room.Title,
		&room.IsPrivate,
		&room.Capacity,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, handler.ErrRecordNotFound
	}
	if err != nil {
		return nil, err
	}

	var isMember bool
	if err := p.Pool.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM users_rooms WHERE room_id = $1 AND user_id = $2
	);`, roomUUID, userID).Scan(&isMember); err != nil {
		return nil, err
	}
	if !isMember {
		return nil, handler.ErrNotRoomMember
	}

	memberRows, err := p.Pool.Query(ctx, `SELECT u.id, u.username, ur.is_admin
		FROM users_rooms ur
		JOIN users u ON u.id = ur.user_id
		WHERE ur.room_id = $1
		ORDER BY ur.is_admin DESC, u.username;`, roomUUID)
	if err != nil {
		return nil, err
	}
	defer memberRows.Close()

	room.Members = make([]models.RoomMember, 0)
	for memberRows.Next() {
		var member models.RoomMember
		if err := memberRows.Scan(&member.UserID, &member.Username, &member.IsAdmin); err != nil {
			return nil, err
		}
		room.Members = append(room.Members, member)
	}
	if err := memberRows.Err(); err != nil {
		return nil, err
	}

	taskRows, err := p.Pool.Query(ctx, `SELECT t.id, t.title, t.description, rt.is_success
		FROM rooms_tasks rt
		JOIN tasks t ON t.id = rt.task_id
		WHERE rt.room_id = $1
		ORDER BY t.id;`, roomUUID)
	if err != nil {
		return nil, err
	}
	defer taskRows.Close()

	room.Tasks = make([]models.Task, 0)
	for taskRows.Next() {
		var task models.Task
		if err := taskRows.Scan(&task.ID, &task.Title, &task.Description, &task.IsSuccess); err != nil {
			return nil, err
		}
		room.Tasks = append(room.Tasks, task)
	}
	if err := taskRows.Err(); err != nil {
		return nil, err
	}

	return &room, nil
}

func (p *PostgresStore) GetMyRooms(userID int) ([]models.RoomsList, error) {
	query := `
	SELECT
		r.id,
		r.title,
		r.is_private,
		r.capacity,
		COUNT(ur_members.user_id) AS members_count,
		ur_user.is_admin
	FROM rooms r
	JOIN users_rooms ur_user
		ON ur_user.room_id = r.id
	LEFT JOIN users_rooms ur_members
		ON ur_members.room_id = r.id
	WHERE ur_user.user_id = $1
	GROUP BY r.id, r.title, r.is_private, r.capacity, ur_user.is_admin
	ORDER BY r.id DESC;
	`

	rows, err := p.Pool.Query(context.Background(), query, userID)
	if err != nil {
		return nil, fmt.Errorf("get user's rooms: %w", err)
	}
	defer rows.Close()

	rooms := make([]models.RoomsList, 0)

	for rows.Next() {
		var room models.RoomsList

		if err := rows.Scan(
			&room.ID,
			&room.Title,
			&room.IsPrivate,
			&room.Capacity,
			&room.MembersCount,
			&room.IsAdmin,
		); err != nil {
			return nil, fmt.Errorf("scan user's room: %w", err)
		}

		room.IsMember = true
		rooms = append(rooms, room)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate user's rooms: %w", err)
	}

	return rooms, nil
}
