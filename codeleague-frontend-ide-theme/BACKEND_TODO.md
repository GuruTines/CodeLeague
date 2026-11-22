# Что нужно добавить и поправить на бэкенде

Фронтенд работает и с текущим бэкендом: там, где эндпоинта нет, он определяет это по ответу
`404 page not found` / `405` и переходит на запасной вариант (данные из `localStorage`, демо-каталог).
Но полноценно — с несколькими устройствами, полным списком участников и каталогом задач — он заработает,
когда появятся эндпоинты из раздела 1. Проверить, как это будет выглядеть, можно уже сейчас: `npm run mock:full`.

> Код ниже написан в стиле вашего проекта, но **я его не компилировал**: в моём окружении нет Go и нет доступа к Go-модулям.
> Считайте это заготовкой и проверьте сборкой.

---

## 1. Недостающие эндпоинты

| Метод и путь | Зачем | Нужен для |
|---|---|---|
| `GET /me` | Кто сейчас залогинен | Восстановление сессии после перезагрузки страницы (сейчас фронт верит `localStorage`) |
| `GET /me/rooms` | Комнаты, где я админ или участник | Профиль: «Созданные мной» и «Я участвую» |
| `GET /rooms` | Список открытых (`is_private = false`) комнат | Вкладка «Открытые комнаты» (п. 3.1 плана) |
| `GET /rooms/{UUID}` | Комната: мета, участники с именами, задачи с `is_success` | Левая и правая колонки комнаты. Только для участников |
| `GET /tasks` | Каталог задач | Каталог и выбор задач при создании комнаты. Рекомендую сделать публичным |
| `GET /tasks/{id}` | Задача + примеры (`task_tests` с `is_sample = true`) | Страница задачи. **Скрытые тесты наружу не отдавать** |

Формы ответов (именно их ждёт фронтенд):

```jsonc
// GET /me
{ "id": 1, "username": "anna_dev", "created_at": "2026-10-27T10:00:00Z" }

// GET /me/rooms  и  GET /rooms
[ { "id": "uuid", "title": "…", "is_private": true, "capacity": 6, "members_count": 3, "is_admin": true } ]

// GET /rooms/{UUID}
{
  "id": "uuid", "title": "…", "is_private": true, "capacity": 6,
  "members": [ { "user_id": 1, "username": "anna_dev", "is_admin": true, "is_muted": false } ],
  "tasks":   [ { "id": 3, "title": "…", "description": "…", "is_success": false } ]
}

// GET /tasks
[ { "id": 1, "title": "…", "description": "…" } ]

// GET /tasks/{id}
{ "id": 1, "title": "…", "description": "…", "samples": [ { "input": "2 3", "expected_output": "5" } ] }
```

### 1.1. Модели (`internal/models`)

```go
// rooms.go
type RoomSummary struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	IsPrivate    bool   `json:"is_private"`
	Capacity     int    `json:"capacity"`
	MembersCount int    `json:"members_count"`
	IsAdmin      bool   `json:"is_admin"`
}

type RoomMember struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"is_admin"`
	IsMuted  bool   `json:"is_muted"`
}

type RoomTask struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	IsSuccess   bool   `json:"is_success"`
}

type RoomDetails struct {
	ID        string       `json:"id"`
	Title     string       `json:"title"`
	IsPrivate bool         `json:"is_private"`
	Capacity  int          `json:"capacity"`
	Members   []RoomMember `json:"members"`
	Tasks     []RoomTask   `json:"tasks"`
}

// tasks.go
type TaskSample struct {
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
}

type TaskDetails struct {
	Task
	Samples []TaskSample `json:"samples"`
}
```

### 1.2. Запросы к БД (`internal/database/postgres/queries.go`)

```go
package postgres

import (
	"context"
	"errors"

	"project/internal/handler"
	"project/internal/models"

	"github.com/jackc/pgx/v5"
)

func (p *PostgresStore) GetUserByID(id int) (*models.UserJSON, error) {
	var u models.UserJSON
	err := p.Pool.QueryRow(context.Background(),
		`SELECT id, username, created_at FROM users WHERE id = $1;`, id,
	).Scan(&u.ID, &u.Username, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, handler.ErrUserUnauthorized
	}
	return &u, err
}

// Комнаты пользователя (создал или состоит).
func (p *PostgresStore) GetUserRooms(userID int) ([]models.RoomSummary, error) {
	return p.queryRooms(`
		SELECT r.id, r.title, r.is_private, r.capacity,
		       (SELECT COUNT(*) FROM users_rooms c WHERE c.room_id = r.id),
		       ur.is_admin
		FROM rooms r
		JOIN users_rooms ur ON ur.room_id = r.id AND ur.user_id = $1
		ORDER BY r.title;`, userID)
}

// Открытые комнаты; is_admin/членство считаем относительно userID.
func (p *PostgresStore) GetPublicRooms(userID int) ([]models.RoomSummary, error) {
	return p.queryRooms(`
		SELECT r.id, r.title, r.is_private, r.capacity,
		       (SELECT COUNT(*) FROM users_rooms c WHERE c.room_id = r.id),
		       COALESCE(ur.is_admin, false)
		FROM rooms r
		LEFT JOIN users_rooms ur ON ur.room_id = r.id AND ur.user_id = $1
		WHERE NOT r.is_private
		ORDER BY r.title;`, userID)
}

func (p *PostgresStore) queryRooms(query string, userID int) ([]models.RoomSummary, error) {
	rows, err := p.Pool.Query(context.Background(), query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rooms := make([]models.RoomSummary, 0)
	for rows.Next() {
		var r models.RoomSummary
		if err := rows.Scan(&r.ID, &r.Title, &r.IsPrivate, &r.Capacity, &r.MembersCount, &r.IsAdmin); err != nil {
			return nil, err
		}
		rooms = append(rooms, r)
	}
	return rooms, rows.Err()
}

func (p *PostgresStore) GetRoomDetails(roomID string) (*models.RoomDetails, error) {
	ctx := context.Background()
	d := models.RoomDetails{Members: []models.RoomMember{}, Tasks: []models.RoomTask{}}

	err := p.Pool.QueryRow(ctx,
		`SELECT id, title, is_private, capacity FROM rooms WHERE id = $1;`, roomID,
	).Scan(&d.ID, &d.Title, &d.IsPrivate, &d.Capacity)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, handler.ErrRecordNotFound
	}
	if err != nil {
		return nil, err
	}

	mrows, err := p.Pool.Query(ctx, `
		SELECT ur.user_id, u.username, ur.is_admin, ur.is_muted
		FROM users_rooms ur JOIN users u ON u.id = ur.user_id
		WHERE ur.room_id = $1
		ORDER BY ur.is_admin DESC, u.username;`, roomID)
	if err != nil {
		return nil, err
	}
	defer mrows.Close()
	for mrows.Next() {
		var m models.RoomMember
		if err := mrows.Scan(&m.UserID, &m.Username, &m.IsAdmin, &m.IsMuted); err != nil {
			return nil, err
		}
		d.Members = append(d.Members, m)
	}
	if err := mrows.Err(); err != nil {
		return nil, err
	}

	trows, err := p.Pool.Query(ctx, `
		SELECT t.id, t.title, t.description, rt.is_success
		FROM rooms_tasks rt JOIN tasks t ON t.id = rt.task_id
		WHERE rt.room_id = $1
		ORDER BY t.id;`, roomID)
	if err != nil {
		return nil, err
	}
	defer trows.Close()
	for trows.Next() {
		var t models.RoomTask
		if err := trows.Scan(&t.ID, &t.Title, &t.Description, &t.IsSuccess); err != nil {
			return nil, err
		}
		d.Tasks = append(d.Tasks, t)
	}
	return &d, trows.Err()
}

func (p *PostgresStore) GetTasks() ([]models.Task, error) {
	rows, err := p.Pool.Query(context.Background(),
		`SELECT id, title, description FROM tasks ORDER BY id;`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := make([]models.Task, 0)
	for rows.Next() {
		var t models.Task
		if err := rows.Scan(&t.ID, &t.Title, &t.Description); err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

func (p *PostgresStore) GetTask(id int) (*models.TaskDetails, error) {
	ctx := context.Background()
	d := models.TaskDetails{Samples: []models.TaskSample{}}

	err := p.Pool.QueryRow(ctx,
		`SELECT id, title, description FROM tasks WHERE id = $1;`, id,
	).Scan(&d.ID, &d.Title, &d.Description)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, handler.ErrTaskNotFound
	}
	if err != nil {
		return nil, err
	}

	// ТОЛЬКО примеры. Скрытые тесты (is_sample = false) пользователю отдавать нельзя.
	rows, err := p.Pool.Query(ctx, `
		SELECT input, expected_output FROM task_tests
		WHERE task_id = $1 AND is_sample = true
		ORDER BY position, id;`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s models.TaskSample
		if err := rows.Scan(&s.Input, &s.ExpectedOutput); err != nil {
			return nil, err
		}
		d.Samples = append(d.Samples, s)
	}
	return &d, rows.Err()
}
```

### 1.3. Хендлеры (`internal/api/read.go`)

Чтобы не плодить сервисный слой ради простых чтений, хендлеры ходят в хранилище через интерфейс.
Если хотите по правилам — вынесите в `service`.

```go
package api

import (
	"net/http"
	"strconv"

	"project/internal/handler"
	"project/internal/middlware"
	"project/internal/models"
)

type ReadStorage interface {
	GetUserByID(id int) (*models.UserJSON, error)
	GetUserRooms(userID int) ([]models.RoomSummary, error)
	GetPublicRooms(userID int) ([]models.RoomSummary, error)
	GetRoomDetails(roomID string) (*models.RoomDetails, error)
	IsUserInRoom(roomID string, userID int) (bool, error)
	GetTasks() ([]models.Task, error)
	GetTask(id int) (*models.TaskDetails, error)
}

type ReadAPI struct{ db ReadStorage }

func NewReadAPI(db ReadStorage) *ReadAPI { return &ReadAPI{db: db} }

func currentUserID(r *http.Request) (int, bool) {
	s, ok := r.Context().Value(middlware.UserKeyID).(string)
	if !ok {
		return 0, false
	}
	id, err := strconv.Atoi(s)
	return id, err == nil
}

func (a *ReadAPI) fail(w http.ResponseWriter, err error) {
	msg, code := handler.GetErrorResponse(err)
	handler.SendErrResponse(w, msg, code)
}

// GET /me
func (a *ReadAPI) MeHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUserID(r)
	if !ok {
		handler.SendErrResponse(w, handler.Unauthorized, http.StatusUnauthorized)
		return
	}
	user, err := a.db.GetUserByID(id)
	if err != nil {
		a.fail(w, err)
		return
	}
	handler.SendJSON(w, user, http.StatusOK)
}

// GET /me/rooms
func (a *ReadAPI) MyRoomsHandler(w http.ResponseWriter, r *http.Request) {
	id, _ := currentUserID(r)
	rooms, err := a.db.GetUserRooms(id)
	if err != nil {
		a.fail(w, err)
		return
	}
	handler.SendJSON(w, rooms, http.StatusOK)
}

// GET /rooms
func (a *ReadAPI) PublicRoomsHandler(w http.ResponseWriter, r *http.Request) {
	id, _ := currentUserID(r)
	rooms, err := a.db.GetPublicRooms(id)
	if err != nil {
		a.fail(w, err)
		return
	}
	handler.SendJSON(w, rooms, http.StatusOK)
}

// GET /rooms/{UUID} — только для участников комнаты
func (a *ReadAPI) RoomHandler(w http.ResponseWriter, r *http.Request) {
	id, _ := currentUserID(r)
	roomID := r.PathValue("UUID")

	member, err := a.db.IsUserInRoom(roomID, id)
	if err != nil {
		a.fail(w, err)
		return
	}
	if !member {
		a.fail(w, handler.ErrNotRoomMember)
		return
	}
	room, err := a.db.GetRoomDetails(roomID)
	if err != nil {
		a.fail(w, err)
		return
	}
	handler.SendJSON(w, room, http.StatusOK)
}

// GET /tasks
func (a *ReadAPI) TasksHandler(w http.ResponseWriter, r *http.Request) {
	tasks, err := a.db.GetTasks()
	if err != nil {
		a.fail(w, err)
		return
	}
	handler.SendJSON(w, tasks, http.StatusOK)
}

// GET /tasks/{id}
func (a *ReadAPI) TaskHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		handler.SendErrResponse(w, "Некорректный ID задачи", http.StatusBadRequest)
		return
	}
	task, err := a.db.GetTask(id)
	if err != nil {
		a.fail(w, err)
		return
	}
	handler.SendJSON(w, task, http.StatusOK)
}
```

### 1.4. Маршруты (`cmd/main.go`)

```go
readAPI := api.NewReadAPI(postgresStore)

http.Handle("GET /me", authMid.AuthMiddlwareWrap(http.HandlerFunc(readAPI.MeHandler)))
http.Handle("GET /me/rooms", authMid.AuthMiddlwareWrap(http.HandlerFunc(readAPI.MyRoomsHandler)))
http.Handle("GET /rooms", authMid.AuthMiddlwareWrap(http.HandlerFunc(readAPI.PublicRoomsHandler)))
http.Handle("GET /rooms/{UUID}", authMid.AuthMiddlwareWrap(http.HandlerFunc(readAPI.RoomHandler)))
http.HandleFunc("GET /tasks", readAPI.TasksHandler)        // публичный каталог
http.HandleFunc("GET /tasks/{id}", readAPI.TaskHandler)
```

Заодно в `SendJSON` / `SendErrResponse` стоит выставлять `w.Header().Set("Content-Type", "application/json")` **до** `WriteHeader` —
сейчас заголовка нет, и браузер видит `text/plain`. Фронтенд к этому готов, но так правильнее.

---

## 2. Улучшения WebSocket и раундов

Сейчас через WebSocket приходят только `chat`, `user_joined`, `user_left`. Поэтому фронтенд раз в 3–6 секунд
опрашивает `GET /rooms/{id}/rounds/active`. Если добавите события, опрос можно будет убрать — фронтенд уже реагирует на них:

| Событие `type` | Когда слать | Что делает фронтенд |
|---|---|---|
| `round_started`, `round_finished` | При старте раунда и при окончании (по таймеру или когда все сдали) | Мгновенно обновляет раунд и комнату (любой `type`, начинающийся с `round`) |
| `room_updated` | Добавили/убрали задачу, отметили решённой, кто-то вошёл | Перезагружает `GET /rooms/{id}` |
| `presence` | Сразу после подключения клиента; `payload` — JSON-массив id в сети, например `"[1,3]"` | Показывает зелёные точки у участников |

Сейчас «в сети» фронтенд узнаёт только по `user_joined`, поэтому тех, кто зашёл раньше вас, он не видит.

Ещё в `OutgoingMessage` удобно добавить `username` — тогда имена в чате работают и без `GET /rooms/{id}`.

Сообщения чата не сохраняются, после перезагрузки доска пустая. Если нужна история — таблица `room_messages` и
`GET /rooms/{id}/messages?limit=100`.

Мьют (`is_muted`) есть в БД, но нигде не проверяется: в `readPump` нужно отбрасывать `chat` от замьюченных, а для самого мьюта —
`PATCH /rooms/{UUID}/users/{userID}` под `AccessMiddlwareWrap`. Фронтенд кнопку мьюта не показывает, пока нет эндпоинта.

### Вердикты в ответах

`UpdateSubmissionResult` сохраняет вердикт, но он нигде не отдаётся. Добавьте в `models.RoundSubmission` поля
`verdict`, `passed_tests`, `total_tests`, `execution_time_ms`, `memory_used_kb` (`omitempty`) и читайте их в `GetRoundSubmissions`.
Фронтенд покажет бейдж «Принято 3/3» сам, как только поля появятся.

Для просмотра решений после раунда нужен ещё `GET /rooms/{UUID}/rounds` (история) или `GET .../rounds/latest`: после окончания
`/rounds/active` возвращает `active: false` без id раунда, поэтому фронтенд запоминает последний раунд в браузере.

---

## 3. Ошибки, которые я нашёл при чтении кода

Отсортировано по тому, насколько они ломают работу.

1. **Judge не принимает `compare_mode`, который шлёт Go.** В `service/round.go`: `CompareMode: "trimmed"`, а Judge
   (`judge/.../models.rs`) знает только `exact | trim_trailing | tokens`, алиасов нет. Скорее всего, каждый вызов Judge падает
   с ошибкой десериализации. Замените на `"trim_trailing"`.
2. **В схеме нет колонок для вердикта.** `UpdateSubmissionResult` пишет `verdict, passed_tests, total_tests, execution_time_ms,
   memory_used_kb, compile_output`, а в `round_submissions` их нет. Добавьте их в `init.sql`.
3. **`docker-compose.yml` монтирует `./init.sql`, а в корне это пустая директория**; настоящий файл лежит в `internal/sql/init.sql`.
   Postgres стартует без схемы. Поправьте путь на `./internal/sql/init.sql`.
4. **Нет защиты от двух активных раундов.** `CreateRound` ловит `23505`, но уникального индекса нет, ошибка никогда не сработает:
   `CREATE UNIQUE INDEX one_active_round_per_room ON rounds(room_id) WHERE round_status = 'active';`
5. **Чужой код виден во время раунда.** `GET .../submissions` отдаёт `source_code` всех, даже пока раунд идёт.
   Пока `round_status = 'active'`, возвращайте только `user_id` и время. (Фронтенд во время раунда использует только счётчик.)
6. **Вход под несуществующим логином отвечает «user already exists».** `FindUserByUsername` возвращает `ErrUserExists` на
   `pgx.ErrNoRows`. Должно быть `ErrInvalidUsernameOrPass`. Фронтенд подменяет текст по статусу, но это стоит поправить.
7. **Повторное вступление в комнату даёт 500.** Нарушение PK (`23505`) в `AddUserInRoom` не обрабатывается. Сделайте операцию
   идемпотентной: если пользователь уже в комнате, ответ `200`. (Фронтенд заранее проверяет членство, чтобы этого не видеть.)
   Вступление в несуществующую комнату сейчас отвечает «В комнате нет места!» — лучше `404`.
8. **`inmemory.InMemoryStore` не потокобезопасен.** Обычный `map` читают и пишут из разных запросов — это `fatal error:
   concurrent map writes`. Добавьте `sync.RWMutex`. Сессии при этом теряются при каждом перезапуске; Redis у вас закомментирован.
9. **`IsAdminInRoom` для не-участника возвращает ошибку → 500** (вы это уже отметили в конце `main.go`). Лучше `false, nil`
   при `pgx.ErrNoRows` — будет `403`.
10. **`SubmitRound` возвращает ошибку, хотя решение уже сохранено**, если Judge не ответил. Клиент видит ошибку, повторная
    отправка даёт `409`. Лучше отвечать `201` и дописывать вердикт позже (фронтенд уже умеет обновлять список).
11. **Cookie `Secure: true`.** Chrome и Firefox принимают её на `http://localhost` и `http://127.0.0.1`, Safari — нет.
    Для разработки в Safari делайте `Secure` зависимым от окружения.
12. **`Room.Link`** = `localhost:9091/rooms/{id}/users` — это адрес API (там POST), а не ссылка для людей. Фронтенд строит ссылку сам:
    `https://ваш-сайт/join/{id}`. Поле `link` можно убрать.
13. **Проверка `Origin` в WebSocket** требует, чтобы `Origin` совпадал с `Host`. За прокси нужно сохранять `Host`
    (`proxy_set_header Host $host;` в nginx, `changeOrigin: false` в Vite — так уже настроено).
