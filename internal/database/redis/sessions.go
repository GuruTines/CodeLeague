package redis

import (
	"context"
	"errors"
	"fmt"
	"project/internal/handler"
	"time"

	"github.com/redis/go-redis/v9"
)

func (r *RedisStore) CreateSession(UUID string, userID any) error {
	if err := r.Conn.Set(context.Background(), UUID, userID, time.Hour*24*7).Err(); err != nil {
		fmt.Println("Ошибка добавления сессии в Redis", err)
		return errors.New(handler.InternalServerError)
	}

	return nil
}

func (r *RedisStore) GetSessionByUUID(UUID string) (string, error) {
	userID, err := r.Conn.Get(context.Background(), UUID).Result()
	if err != nil {
		fmt.Println("Ошибка чтения сессии в Redis", err)
		if errors.Is(err, redis.Nil) {
			return "", errors.New(handler.WriteNotExists)
		}
		return "", errors.New(handler.InternalServerError)
	}

	return userID, nil
}

func (r *RedisStore) DeleteSessionByUUID(UUID string) error {
	if err := r.Conn.Del(context.Background(), UUID).Err(); err != nil {
		fmt.Println("Ошибка удаления сессии в Redis", err)
		if errors.Is(err, redis.Nil) {
			return errors.New(handler.WriteNotExists)
		}
		return errors.New(handler.InternalServerError)
	}

	return nil
}
