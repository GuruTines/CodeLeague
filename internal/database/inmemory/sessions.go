package inmemory

import (
	"fmt"
	"project/internal/handler"
	"strconv"
)

func (i *InMemoryStore) CreateSession(UUID string, userID any) error {
	strUserID := strconv.Itoa(userID.(int))
	i.store[UUID] = strUserID

	fmt.Println(i.store)

	return nil
}

func (i *InMemoryStore) GetSessionByUUID(UUID string) (string, error) {
	value, ok := i.store[UUID]

	if !ok {
		return "", handler.ErrUserUnauthorized
	}

	fmt.Println(i.store)

	return value, nil
}

func (i *InMemoryStore) DeleteSessionByUUID(UUID string) error {
	if _, ok := i.store[UUID]; !ok {
		return handler.ErrUserUnauthorized
	}

	delete(i.store, UUID)
	fmt.Println(i.store)

	return nil
}
