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
    input TEXT NOT NULL,
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
    verdict VARCHAR(30),
    passed_tests INTEGER NOT NULL DEFAULT 0,
    total_tests INTEGER NOT NULL DEFAULT 0,
    execution_time_ms INTEGER NOT NULL DEFAULT 0,
    memory_used_kb INTEGER NOT NULL DEFAULT 0,
    compile_output TEXT NOT NULL DEFAULT '',
    CONSTRAINT unique_user_submission_per_round
    UNIQUE (round_id, user_id)
);


INSERT INTO tasks (title, description, signature) VALUES
(
    'Two Sum',
    'Given an array of integers nums and an integer target, return indices of two numbers whose sum equals target. Assume exactly one solution exists. You cannot use the same element twice.',
    '{
        "name": "solve",
        "params": [
            {"name": "nums", "type": "int[]"},
            {"name": "target", "type": "int"}
        ],
        "return_type": "int[]"
    }'::jsonb
),

(
    'Reverse String',
    'Given a string s, return the string reversed. The input contains ASCII characters.',
    '{
        "name": "solve",
        "params": [
            {"name": "s", "type": "string"}
        ],
        "return_type": "string"
    }'::jsonb
),

(
    'Palindrome',
    'Given a string s, return true if it reads the same forward and backward, otherwise return false. Comparison is case-sensitive.',
    '{
        "name": "solve",
        "params": [
            {"name": "s", "type": "string"}
        ],
        "return_type": "bool"
    }'::jsonb
),

(
    'Factorial',
    'Given an integer n (0 <= n <= 20), return its factorial. Factorial of zero is one.',
    '{
        "name": "solve",
        "params": [
            {"name": "n", "type": "int"}
        ],
        "return_type": "long"
    }'::jsonb
),

(
    'Maximum Element',
    'Given a non-empty array of integers, return its maximum element.',
    '{
        "name": "solve",
        "params": [
            {"name": "nums", "type": "int[]"}
        ],
        "return_type": "int"
    }'::jsonb
),

(
    'Fibonacci Number',
    'Given an integer n (0 <= n <= 92), return the nth Fibonacci number. F(0) = 0, F(1) = 1.',
    '{
        "name": "solve",
        "params": [
            {"name": "n", "type": "int"}
        ],
        "return_type": "long"
    }'::jsonb
),

(
    'Count Vowels',
    'Given a string s, count the English vowels (a, e, i, o, u). The comparison is case-insensitive.',
    '{
        "name": "solve",
        "params": [
            {"name": "s", "type": "string"}
        ],
        "return_type": "int"
    }'::jsonb
),

(
    'Merge Sorted Arrays',
    'Given two arrays of integers sorted in ascending order, merge them into one sorted array.',
    '{
        "name": "solve",
        "params": [
            {"name": "a", "type": "int[]"},
            {"name": "b", "type": "int[]"}
        ],
        "return_type": "int[]"
    }'::jsonb
),

(
    'Prime Number',
    'Given an integer n, return true if n is a prime number, otherwise return false. Numbers less than 2 are not prime.',
    '{
        "name": "solve",
        "params": [
            {"name": "n", "type": "int"}
        ],
        "return_type": "bool"
    }'::jsonb
),

(
    'Binary Search',
    'Given a sorted array of integers and a target, return the index of the target. Return -1 if the target is not found.',
    '{
        "name": "solve",
        "params": [
            {"name": "nums", "type": "int[]"},
            {"name": "target", "type": "int"}
        ],
        "return_type": "int"
    }'::jsonb
);


-- TEST CASES

INSERT INTO task_tests
    (task_id, input, expected_output, is_sample, position)

SELECT
    t.id,
    v.input,
    v.expected_output,
    v.is_sample,
    v.position
FROM (VALUES

    ('Two Sum', '[[2,7,11,15],9]', '[0,1]', true, 0),
    ('Two Sum', '[[3,2,4],6]', '[1,2]', true, 1),
    ('Two Sum', '[[3,3],6]', '[0,1]', false, 2),
    ('Reverse String', '["hello"]', '"olleh"', true, 0),
    ('Reverse String', '["Go"]', '"oG"', true, 1),
    ('Reverse String', '[""]', '""', false, 2),
    ('Palindrome', '["racecar"]', 'true', true, 0),
    ('Palindrome', '["hello"]', 'false', true, 1),
    ('Palindrome', '["a"]', 'true', false, 2),
    ('Palindrome', '[""]', 'true', false, 3),
    ('Factorial', '[0]', '1', true, 0),
    ('Factorial', '[5]', '120', true, 1),
    ('Factorial', '[10]', '3628800', false, 2),
    ('Factorial', '[20]', '2432902008176640000', false, 3),
    ('Maximum Element', '[[-3,0,12,7,4]]', '12', true, 0),
    ('Maximum Element', '[[-8,-5]]', '-5', true, 1),
    ('Maximum Element', '[[5,5,2,1]]', '5', false, 2),
    ('Fibonacci Number', '[0]', '0', true, 0),
    ('Fibonacci Number', '[1]', '1', true, 1),
    ('Fibonacci Number', '[10]', '55', false, 2),
    ('Fibonacci Number', '[50]', '12586269025', false, 3),
    ('Fibonacci Number', '[92]', '7540113804746346429', false, 4),
    ('Count Vowels', '["hello"]', '2', true, 0),
    ('Count Vowels', '["OpenAI"]', '4', true, 1),
    ('Count Vowels', '["rythm"]', '0', false, 2),
    ('Count Vowels', '[""]', '0', false, 3),
    ('Merge Sorted Arrays', '[[1,3,5],[2,4,6]]', '[1,2,3,4,5,6]', true, 0),
    ('Merge Sorted Arrays', '[[],[1,2,3]]', '[1,2,3]', true, 1),
    ('Merge Sorted Arrays', '[[1,2],[3,4]]', '[1,2,3,4]', false, 2),
    ('Prime Number', '[2]', 'true', true, 0),
    ('Prime Number', '[1]', 'false', true, 1),
    ('Prime Number', '[17]', 'true', false, 2),
    ('Prime Number', '[100]', 'false', false, 3),
    ('Binary Search', '[[1,3,5,7,9],7]', '3', true, 0),
    ('Binary Search', '[[1,3,5,7,9],4]', '-1', true, 1),
    ('Binary Search', '[[2],2]', '0', false, 2),
    ('Binary Search', '[[],1]', '-1', false, 3)

) AS v(title, input, expected_output, is_sample, position)

JOIN tasks t ON t.title = v.title;
