package inmemory

import (
	"errors"
	"fmt"
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
		return "", errors.New("Ключа не существует!")
	}

	fmt.Println(i.store)

	return value, nil
}

func (i *InMemoryStore) DeleteSessionByUUID(UUID string) error {
	if _, ok := i.store[UUID]; !ok {
		return errors.New("Ключа не существует!")
	}

	delete(i.store, UUID)
	fmt.Println(i.store)

	return nil
}
