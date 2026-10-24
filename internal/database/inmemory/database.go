package inmemory

type InMemoryStore struct {
	store map[string]string
}

func NewMemory() *InMemoryStore {
	return &InMemoryStore{
		store: make(map[string]string, 10),
	}
}
