package postgres

import (
	"context"
	"errors"
	"project/internal/handler"
	"project/internal/models"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (p *PostgresStore) CreateUser(user models.UserInput) (*models.UserJSON, error) {
	var userResult models.UserJSON
	var pgErr *pgconn.PgError

	query := `INSERT INTO users (username, password)
	VALUES ($1, $2)
	RETURNING id, username, created_at;`
	if err := p.Pool.QueryRow(context.Background(), query, user.Username, user.Password).Scan(
		&userResult.ID,
		&userResult.Username,
		&userResult.CreatedAt,
	); err != nil {
		//
		if errors.As(err, &pgErr) {
			// Нарушение ограничения UNIQUE
			if pgErr.Code == "23505" {
				return nil, handler.ErrUserExists
			}
		}
		return nil, err
	}

	return &userResult, nil
}

func (p *PostgresStore) FindUserByUsername(username string) (*models.User, error) {
	var userResult models.User

	query := `SELECT * FROM users
	WHERE username = $1;`
	if err := p.Pool.QueryRow(context.Background(), query, username).Scan(
		&userResult.ID,
		&userResult.Username,
		&userResult.Password,
		&userResult.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, handler.ErrUserExists
		}
		return nil, err
	}

	return &userResult, nil
}
