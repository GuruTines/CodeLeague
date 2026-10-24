package redis

// Конфиг для redis (структура options)
type ConfigRedis struct {
	Addr     string
	Password string
	DB       int
}
