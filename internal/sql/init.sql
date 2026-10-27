CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(128) NOT NULL UNIQUE,
    password VARCHAR(256) NOT NULL,
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

CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    description TEXT NOT NULL
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