# codeleague-judge

Изолированный микросервис компиляции и проверки решений для CodeLeague (Rust, tokio + axum).
Go-бэкенд отправляет исходный код, тесты и лимиты — сервис возвращает вердикт, время и память.

```
src/
  api/      axum-роутер, авторизация по токену, перехват паник
  runner/   конвейер: workspace → компиляция → прогон тестов; описания языков
  sandbox/  запуск процесса с лимитами, замер CPU/памяти, watchdog'и
  judge/    классификация вердикта и сравнение вывода
  config.rs, error.rs, models.rs
tests/judge.rs   сквозные тесты (реальные компиляторы + HTTP-роутер)
```

## Запуск

```bash
cargo run --release           # слушает CL_BIND (по умолчанию 0.0.0.0:8081)
cargo test                    # тесты для отсутствующих компиляторов пропускаются
```

Переменные окружения: `CL_BIND`, `CL_API_TOKEN` (Bearer-токен для `/v1/*`), `CL_WORK_ROOT`, `CL_MAX_JOBS`,
`CL_RUN_UID_BASE` (<=0 отключает смену uid), `CL_REQUIRE_NAMESPACES`, `CL_MAX_TESTS`, `CL_MAX_TIME_LIMIT_MS`,
`CL_MAX_MEMORY_LIMIT_MB`, `CL_MAX_OUTPUT_BYTES`, `CL_COMPILE_TIMEOUT_SECS`, `CL_CC/CXX/PYTHON/RUSTC/GO`, `RUST_LOG`.

## API

`GET /healthz` · `GET /v1/languages` · `POST /v1/judge`

```jsonc
// POST /v1/judge
{
  "language": "c",                // c | cpp | python | rust | go  (алиасы: c++, py, python3, rs, golang)
  "source_code": "...",
  "tests": [{ "input": "2 3\n", "expected_output": "5\n" }],
  "time_limit_ms": 1000,          // CPU-время на тест
  "memory_limit_mb": 64,          // пиковый RSS на тест
  "compare_mode": "trim_trailing",// exact | trim_trailing (по умолч.) | tokens
  "stop_on_first_failure": true   // по умолч. true
}
```

Ответ: `verdict` (`ACCEPTED`, `WRONG_ANSWER`, `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED`, `RUNTIME_ERROR`,
`COMPILATION_ERROR`), `passed`, `total`, `time_ms`, `memory_kb` (максимумы), `compile_output` (при CE) и
`tests[]` с вердиктом, временем, памятью, `exit_code`/`signal`, усечёнными `stdout`/`stderr`.
Ошибки сервиса: `{"error":{"code","message"}}` (400 — невалидный запрос, 401 — токен, 422 — язык недоступен, 500 — сбой).

Приоритет вердикта: превышение времени/памяти → крэш/ненулевой код → сравнение вывода.
Переполнение вывода (`CL_MAX_OUTPUT_BYTES`) даёт `RUNTIME_ERROR` с пояснением в `message`.

## Модель изоляции

Для каждого запуска (и компиляции тоже):
* отдельная сессия и группа процессов — при завершении/лимите убивается вся группа (в т.ч. потомки);
* `RLIMIT_CPU/AS/FSIZE/NOFILE/NPROC/STACK/CORE`, `PR_SET_NO_NEW_PRIVS`;
* новые network/IPC/UTS namespaces (нужен `CAP_SYS_ADMIN`; при отсутствии — предупреждение в логе,
  либо отказ при `CL_REQUIRE_NAMESPACES=true`);
* при запуске от root — смена на непривилегированный uid/gid. У каждого слота параллельности свой uid
  (`CL_RUN_UID_BASE + слот`), так что одновременные решения не видят файлы друг друга;
* watchdog по стеночному времени (`2×TL + 0.5с`) и по памяти (опрос `VmHWM` из `/proc` каждые 2 мс);
* отдельный пустой рабочий каталог на каждый тест, удаляется после.

Измерения: время — user+sys из `wait4` rusage; память — пик `VmHWM`.

### Ограничения
* **Нет seccomp и chroot/mount namespace**: код пользователя видит файловую систему контейнера
  (только чтение, из-за смены uid). Запускайте сервис в контейнере/VM без секретов, rootfs read-only
  (кроме `CL_WORK_ROOT`). Для жёсткой изоляции добавьте seccomp-профиль или gVisor/Firecracker.
* **Память**: лимит проверяется опросом раз в 2 мс; программа, выделившая память и завершившаяся быстрее,
  может проскочить. `RLIMIT_AS` (2×лимит+256 МБ; для Go отключён) — страховка. cgroup v2
  (`memory.max`/`memory.peak`) — естественное расширение `sandbox/`.
* Для процессов, завершившихся до первого опроса, память берётся из `ru_maxrss` (может включать память родителя).
* Компиляторы должны быть установлены глобально и доступны непривилегированному uid
  (не в `~/.cargo`/`~/.rustup`; rustup-прокси не подойдёт). См. `Dockerfile`.
* Кэш сборки Go общий между запусками одного слота (ускоряет компиляцию).
* Параллельные задачи делят CPU и могут искажать замеры; `CL_MAX_JOBS` по умолчанию = числу ядер.
* gRPC не реализован — только REST. Новый язык добавляется в `runner/language.rs`.
