package redis

import (
	"context"

	"github.com/redis/go-redis/v9"
)

type RedisStore struct {
	Conn *redis.Client
}

func NewRedisConnect(configRedis ConfigRedis) (*RedisStore, error) {
	conn := redis.NewClient(&redis.Options{
		Addr:     configRedis.Addr,
		Password: configRedis.Password,
		DB:       configRedis.DB,
	})

	if _, err := conn.Ping(context.Background()).Result(); err != nil {
		return nil, err
	}

	return &RedisStore{Conn: conn}, nil
}
