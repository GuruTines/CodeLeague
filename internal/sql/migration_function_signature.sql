-- Переход на формат «решение — функция» для уже созданной базы.
-- Для новой базы достаточно init.sql.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS signature JSONB;

-- Дальше для КАЖДОЙ существующей задачи нужно вручную:
--   1) задать сигнатуру;
--   2) переписать тесты из формата stdin/stdout в JSON.
-- Пример для задачи «Сумма двух чисел» (id = 1):
--
--   UPDATE tasks SET signature = '{
--       "name": "solve",
--       "params": [{"name": "a", "type": "int"}, {"name": "b", "type": "int"}],
--       "return_type": "int"
--   }' WHERE id = 1;
--
--   -- было: input = '2 3', expected_output = '5'
--   -- стало: input = '[2, 3]' (массив аргументов), expected_output = '5' (JSON-значение)
--   UPDATE task_tests SET input = '[2, 3]' WHERE task_id = 1 AND input = '2 3';
--
-- Пока у задачи нет сигнатуры, сдать по ней решение нельзя: Go-бэкенд отклонит отправку
-- до сохранения (попытка не расходуется), а фронтенд покажет предупреждение.
-- Задачи без сигнатуры можно найти так:
--   SELECT id, title FROM tasks WHERE signature IS NULL;
