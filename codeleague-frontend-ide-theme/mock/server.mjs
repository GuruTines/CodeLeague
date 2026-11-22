// Мок бэкенда CodeLeague для разработки фронтенда без Go/Postgres/Judge.
//   npm run mock          — ровно те эндпоинты, что есть в вашем бэкенде сейчас
//   npm run mock:full     — плюс предлагаемые (GET /me, /me/rooms, /rooms, /rooms/{id}, /tasks, /tasks/{id})
// Повторяет особенности реального API: ответы без Content-Type, 404 text/plain на неизвестный
// маршрут, 405 на неверный метод, формат ошибок {message,status_code,created_at}.
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const FULL = process.env.MOCK_FULL === '1';
const PORT = Number(process.env.PORT || 9091);

const users = [];
const sessions = new Map();
const rooms = new Map();
const members = new Map();   // roomId -> [{user_id,is_admin,is_muted}]
const roomTasks = new Map(); // roomId -> [{task_id,is_success}]
const rounds = [];
const submissions = [];
const sockets = new Map();   // roomId -> Set<{ws,userId}>

const tasks = [
  { id: 1, title: 'Сумма двух чисел', description: 'Даны два целых числа a и b. Выведите их сумму.\n\nВходные данные\nВ одной строке два целых числа.\n\nВыходные данные\nОдно число — a + b.', samples: [{ input: '2 3', expected_output: '5' }] },
  { id: 2, title: 'FizzBuzz', description: 'Выведите числа от 1 до n. Вместо кратных 3 — Fizz, кратных 5 — Buzz, обоим — FizzBuzz.', samples: [{ input: '5', expected_output: '1\n2\nFizz\n4\nBuzz' }] },
  { id: 3, title: 'Палиндром', description: 'Определите, является ли строка палиндромом. Регистр и пробелы не учитываются. Выведите YES или NO.', samples: [{ input: 'А роза упала на лапу Азора', expected_output: 'YES' }] },
  { id: 4, title: 'Два числа с заданной суммой', description: 'Дан массив и число target. Найдите индексы i < j, для которых a[i] + a[j] = target.', samples: [{ input: '4 9\n2 7 11 15', expected_output: '0 1' }] },
  { id: 5, title: 'Скобочная последовательность', description: 'Проверьте, правильно ли расставлены скобки ()[]{} в строке. Выведите YES или NO.', samples: [{ input: '([]{})', expected_output: 'YES' }] }
];

const send = (res, status, data) => { res.writeHead(status); res.end(data === null || data === undefined ? '' : JSON.stringify(data)); };
const err = (res, status, message) => send(res, status, { message, status_code: status, created_at: new Date().toISOString() });
const publicUser = (u) => ({ id: u.id, username: u.username, created_at: u.created_at });
const readBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve(null); } }); });
const cookieOf = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]));
const authUser = (req) => { const id = sessions.get(cookieOf(req).session_token); return id ? users.find((u) => u.id === id) : null; };
const isMember = (roomId, userId) => (members.get(roomId) || []).some((m) => m.user_id === userId);
const isAdmin = (roomId, userId) => (members.get(roomId) || []).some((m) => m.user_id === userId && m.is_admin);

function activeRound(roomId) {
  const r = rounds.find((x) => x.room_id === roomId && x.round_status === 'active');
  if (r && Date.parse(r.started_at) + r.duration_seconds * 1000 <= Date.now()) { r.round_status = 'finished'; r.ended_at = new Date().toISOString(); return null; }
  return r || null;
}
function broadcast(roomId, type, userId, payload = '') {
  const data = JSON.stringify({ type, room_id: roomId, user_id: String(userId), payload });
  (sockets.get(roomId) || new Set()).forEach((c) => c.ws.send(data));
}
const withTasks = (roomId, full) => (roomTasks.get(roomId) || []).map((rt) => {
  const t = tasks.find((x) => x.id === rt.task_id);
  return full ? { id: t.id, title: t.title, description: t.description, is_success: rt.is_success } : { id: t.id, title: t.title, description: t.description };
});
const roomView = (roomId, userId) => {
  const r = rooms.get(roomId);
  const list = members.get(roomId) || [];
  return { ...r, members_count: list.length, is_admin: isAdmin(roomId, userId) };
};

const routes = [];
const route = (method, pattern, { auth = true, admin = false, full = false } = {}, handler) => {
  if (full && !FULL) return;
  routes.push({ method, re: new RegExp(`^${pattern.replace(/\{(\w+)\}/g, '(?<$1>[^/]+)')}$`), auth, admin, handler });
};

route('POST', '/register', { auth: false }, async (req, res, { body }) => {
  const { username = '', password = '' } = body || {};
  if ([...username].length < 3 || password.length < 8 || !/^[A-Za-z0-9]+$/.test(password) || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return err(res, 400, 'Пароль невалиден!');
  if (users.some((u) => u.username === username)) return err(res, 409, 'Ошибка при регистрации пользователя!');
  const u = { id: users.length + 1, username, password, created_at: new Date().toISOString() };
  users.push(u);
  const token = crypto.randomUUID(); sessions.set(token, u.id);
  res.setHeader('Set-Cookie', `session_token=${token}; Path=/; Max-Age=604800; HttpOnly`);
  send(res, 201, publicUser(u));
});
route('POST', '/login', { auth: false }, async (req, res, { body }) => {
  const u = users.find((x) => x.username === body?.username);
  if (!u) return err(res, 400, 'user already exists'); // как в реальном бэкенде
  if (u.password !== body.password) return err(res, 400, 'invalid username or password');
  const token = crypto.randomUUID(); sessions.set(token, u.id);
  res.setHeader('Set-Cookie', `session_token=${token}; Path=/; Max-Age=604800; HttpOnly`);
  send(res, 200, publicUser(u));
});
route('DELETE', '/logout', { auth: false }, async (req, res) => {
  const t = cookieOf(req).session_token;
  if (!sessions.delete(t)) return err(res, 401, 'Пользователь не авторизован! Зарегистрируйтесь или войдите в аккаунт!');
  res.setHeader('Set-Cookie', 'session_token=; Path=/; Max-Age=0; HttpOnly');
  send(res, 200, null);
});

route('POST', '/rooms', {}, async (req, res, { user, body }) => {
  const { title = '', is_private = false, capacity = 0 } = body || {};
  if ([...title].length < 3) return err(res, 500, 'Название должно содержать не меньше 3 символов!');
  if (capacity < 1 || capacity > 15) return err(res, 500, 'Вместимость комнаты должна быть от 1 до 15!');
  const id = crypto.randomUUID();
  const room = { id, title, is_private, capacity };
  rooms.set(id, room); members.set(id, [{ user_id: user.id, is_admin: true, is_muted: false }]); roomTasks.set(id, []);
  send(res, 201, { ...room, link: `localhost:9091/rooms/${id}/users` });
});
route('DELETE', '/rooms/{UUID}', { admin: true }, async (req, res, { params }) => {
  rooms.delete(params.UUID); members.delete(params.UUID); roomTasks.delete(params.UUID); send(res, 200, null);
});
route('POST', '/rooms/{UUID}/tasks', { admin: true }, async (req, res, { params, body }) => {
  const ids = body?.tasks_id || [];
  if (!ids.length) return err(res, 400, 'Пароль невалиден!');
  const list = roomTasks.get(params.UUID);
  for (const id of ids) {
    if (!tasks.some((t) => t.id === id)) return err(res, 404, 'Запись не найдена!');
    if (list.some((x) => x.task_id === id)) return err(res, 409, 'Операция конфликтует с текущим состоянием ресурса!');
  }
  ids.forEach((id) => list.push({ task_id: id, is_success: false }));
  send(res, 200, withTasks(params.UUID, false));
});
route('DELETE', '/rooms/{UUID}/tasks', { admin: true }, async (req, res, { params, body }) => {
  const list = roomTasks.get(params.UUID); const before = list.length;
  roomTasks.set(params.UUID, list.filter((x) => !(body?.tasks_id || []).includes(x.task_id)));
  if (roomTasks.get(params.UUID).length === before) return err(res, 404, 'Запись не найдена!');
  res.writeHead(204); res.end();
});
route('PATCH', '/rooms/{UUID}/tasks/{taskID}', { admin: true }, async (req, res, { params }) => {
  const rt = roomTasks.get(params.UUID).find((x) => x.task_id === Number(params.taskID)); if (rt) rt.is_success = true;
  res.writeHead(204); res.end();
});
route('POST', '/rooms/{UUID}/users', {}, async (req, res, { user, params }) => {
  const room = rooms.get(params.UUID);
  if (!room) return err(res, 400, 'В комнате нет места!');
  const list = members.get(room.id);
  if (list.some((m) => m.user_id === user.id)) return err(res, 500, 'Внутренняя ошибка сервера!');
  if (list.length >= room.capacity) return err(res, 400, 'В комнате нет места!');
  list.push({ user_id: user.id, is_admin: false, is_muted: false });
  send(res, 200, null);
});

route('POST', '/rooms/{UUID}/rounds', { admin: true }, async (req, res, { params, body }) => {
  const { task_id, duration_seconds } = body || {};
  if (duration_seconds < 30 || duration_seconds > 7200) return err(res, 400, 'длительность раунда должна быть от 30 до 7200 секунд');
  if (!roomTasks.get(params.UUID).some((x) => x.task_id === task_id)) return err(res, 404, 'задача не добавлена в комнату');
  if (activeRound(params.UUID)) return err(res, 409, 'в комнате уже идёт раунд');
  const t = tasks.find((x) => x.id === task_id);
  const r = { id: crypto.randomUUID(), room_id: params.UUID, task_id, task_title: t.title, task_description: t.description, round_status: 'active', duration_seconds, started_at: new Date().toISOString() };
  rounds.push(r); send(res, 201, r);
});
route('GET', '/rooms/{UUID}/rounds/active', {}, async (req, res, { user, params }) => {
  if (!isMember(params.UUID, user.id)) return err(res, 403, 'пользователь не состоит в комнате');
  const r = activeRound(params.UUID);
  send(res, 200, { active: Boolean(r), round: r });
});
route('POST', '/rooms/{UUID}/rounds/{roundID}/submissions', {}, async (req, res, { user, params, body }) => {
  const r = activeRound(params.UUID);
  if (!r || r.id !== params.roundID) return err(res, 409, 'раунд уже завершён или время истекло');
  if (!isMember(params.UUID, user.id)) return err(res, 403, 'пользователь не состоит в комнате');
  if (submissions.some((s) => s.round_id === r.id && s.user_id === user.id)) return err(res, 409, 'решение уже отправлено');
  const s = { id: crypto.randomUUID(), round_id: r.id, user_id: user.id, source_code: body.source_code, language: body.language, submitted_at: new Date().toISOString() };
  if (FULL) Object.assign(s, { verdict: s.source_code.includes('FAIL') ? 'WRONG_ANSWER' : 'ACCEPTED', passed_tests: s.source_code.includes('FAIL') ? 1 : 3, total_tests: 3 });
  submissions.push(s);
  if (submissions.filter((x) => x.round_id === r.id).length >= members.get(params.UUID).length) { r.round_status = 'finished'; r.ended_at = new Date().toISOString(); }
  send(res, 201, s);
});
route('GET', '/rooms/{UUID}/rounds/{roundID}/submissions', {}, async (req, res, { user, params }) => {
  if (!isMember(params.UUID, user.id)) return err(res, 403, 'пользователь не состоит в комнате');
  send(res, 200, submissions.filter((s) => s.round_id === params.roundID));
});

// ── предлагаемые эндпоинты ──
route('GET', '/me', { full: true }, async (req, res, { user }) => send(res, 200, publicUser(user)));
route('GET', '/me/rooms', { full: true }, async (req, res, { user }) => send(res, 200, [...rooms.keys()].filter((id) => isMember(id, user.id)).map((id) => roomView(id, user.id))));
route('GET', '/rooms', { full: true }, async (req, res, { user }) => send(res, 200, [...rooms.values()].filter((r) => !r.is_private).map((r) => roomView(r.id, user.id))));
route('GET', '/rooms/{UUID}', { full: true }, async (req, res, { user, params }) => {
  const r = rooms.get(params.UUID);
  if (!r) return err(res, 404, 'Запись не найдена!');
  if (!isMember(r.id, user.id)) return err(res, 403, 'Пользователь не состоит в комнате!');
  send(res, 200, { ...r, members: members.get(r.id).map((m) => ({ ...m, username: users.find((u) => u.id === m.user_id).username })), tasks: withTasks(r.id, true) });
});
route('GET', '/tasks', { full: true, auth: false }, async (req, res) => send(res, 200, tasks.map(({ id, title, description }) => ({ id, title, description }))));
route('GET', '/tasks/{id}', { full: true, auth: false }, async (req, res, { params }) => {
  const t = tasks.find((x) => x.id === Number(params.id));
  t ? send(res, 200, t) : err(res, 404, 'Запись не найдена!');
});

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname.replace(/\/ws$/, (m) => m);
  const matches = routes.filter((r) => r.re.test(path));
  const hit = matches.find((r) => r.method === req.method);
  if (!hit) {
    if (matches.length) { res.writeHead(405); return res.end('Method Not Allowed\n'); }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 page not found\n');
  }
  const params = path.match(hit.re).groups || {};
  let user = null;
  if (hit.auth) {
    user = authUser(req);
    if (!user) return err(res, 401, 'Пользователь не авторизован! Зарегистрируйтесь или войдите в аккаунт!');
  }
  if (hit.admin && !isAdmin(params.UUID, user.id)) return err(res, 403, 'Нет прав для этого действия!');
  const body = ['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method) ? await readBody(req) : undefined;
  if (body === null) return err(res, 400, 'Некорректное тело запроса');
  hit.handler(req, res, { user, params, body });
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const m = new URL(req.url, 'http://x').pathname.match(/^\/rooms\/([^/]+)\/ws$/);
  const user = authUser(req);
  const origin = req.headers.origin;
  if (!m || !user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
  if (origin && origin !== `http://${req.headers.host}`) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy(); } // как CheckOrigin в Go
  if (!isMember(m[1], user.id)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const roomId = m[1];
    const client = { ws, userId: user.id };
    if (!sockets.has(roomId)) sockets.set(roomId, new Set());
    sockets.get(roomId).add(client);
    broadcast(roomId, 'user_joined', user.id);
    ws.on('message', (raw) => {
      try { const msg = JSON.parse(raw); if (msg.type === 'chat' && msg.payload.length <= 4000) broadcast(roomId, 'chat', user.id, msg.payload); } catch { /* ignore */ }
    });
    ws.on('close', () => { sockets.get(roomId)?.delete(client); broadcast(roomId, 'user_left', user.id); });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`CodeLeague mock API: http://127.0.0.1:${PORT} (${FULL ? 'full' : 'current backend only'})`));
