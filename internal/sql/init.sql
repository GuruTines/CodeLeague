CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(128) NOT NULL UNIQUE,
    password VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(128) NOT NULL,
    is_private BOOLEAN NOT NULL DEFAULT false,
    capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 15)
);

CREATE TABLE users_rooms (
    user_id INTEGER,
    room_id UUID,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    is_muted BOOLEAN NOT NULL DEFAULT false,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    PRIMARY KEY (user_id, room_id)
);

-- Задача — это функция, как на LeetCode. signature описывает её, а тесты хранят
-- аргументы и ответ в JSON (см. task_tests ниже):
--   {"name": "solve",
--    "params": [{"name": "nums", "type": "int[]"}, {"name": "target", "type": "int"}],
--    "return_type": "int[]"}
-- Типы: int, long, double, bool, string, а также T[] и T[][].
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    signature JSONB
);

CREATE TABLE users_tasks (
    user_id INTEGER,
    task_id INTEGER,
	is_success BOOLEAN NOT NULL DEFAULT false,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (task_id) REFERENCES tasks(id), 
    PRIMARY KEY (user_id, task_id)
);

CREATE TABLE rooms_tasks (
    room_id UUID,
    task_id INTEGER,
	is_success BOOLEAN NOT NULL DEFAULT false,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (task_id) REFERENCES tasks(id), 
    PRIMARY KEY (room_id, task_id)
);

CREATE TABLE rounds (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    round_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (round_status IN ('active', 'finished')),
    duration_seconds INTEGER NOT NULL
        CHECK (duration_seconds > 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);


CREATE TABLE task_tests (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL
        REFERENCES tasks(id) ON DELETE CASCADE,

    -- JSON-массив аргументов по порядку параметров, например: [[2, 7, 11, 15], 9]
    input TEXT NOT NULL,
    -- JSON возвращаемого значения, например: [0, 1]
    expected_output TEXT NOT NULL,

    is_sample BOOLEAN NOT NULL DEFAULT false,
    position INTEGER NOT NULL DEFAULT 0
        CHECK (position >= 0)
);

CREATE TABLE round_submissions (
    id UUID PRIMARY KEY,
    round_id UUID NOT NULL
        REFERENCES rounds(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL
        REFERENCES users(id),
    source_code TEXT NOT NULL,
    language VARCHAR(30) NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_user_submission_per_round
        UNIQUE (round_id, user_id)
);

ALTER TABLE round_submissions
    ADD COLUMN verdict VARCHAR(30),
    ADD COLUMN passed_tests INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN total_tests INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN execution_time_ms INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN memory_used_kb INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN compile_output TEXT NOT NULL DEFAULT '';