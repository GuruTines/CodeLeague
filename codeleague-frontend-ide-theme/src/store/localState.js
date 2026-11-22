// Локальная «память» браузера. Нужна как запасной вариант, пока на бэкенде нет
// GET /me, GET /me/rooms и GET /rooms/{id}: так список комнат и задач не теряется
// после перезагрузки страницы. Когда эндпоинты появятся, данные берутся с сервера,
// а это хранилище остаётся только кэшем.
const KEY = 'codeleague.v2';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* квота / приватный режим */ }
}
function bucket(data, userId) {
  data.users = data.users || {};
  data.users[userId] = data.users[userId] || { rooms: {}, drafts: {} };
  return data.users[userId];
}

export const getStoredUser = () => read().user || null;
export function setStoredUser(user) {
  const data = read();
  if (user) data.user = user; else delete data.user;
  write(data);
}

export function listLocalRooms(userId) {
  if (userId == null) return [];
  const rooms = Object.values(bucket(read(), userId).rooms);
  return rooms.sort((a, b) => (b.touched_at || 0) - (a.touched_at || 0));
}

export function getLocalRoom(userId, roomId) {
  if (userId == null) return null;
  return bucket(read(), userId).rooms[roomId] || null;
}

export function upsertLocalRoom(userId, patch) {
  if (userId == null || !patch?.id) return null;
  const data = read();
  const rooms = bucket(data, userId).rooms;
  rooms[patch.id] = { ...(rooms[patch.id] || {}), ...patch, touched_at: Date.now() };
  write(data);
  return rooms[patch.id];
}

export function removeLocalRoom(userId, roomId) {
  if (userId == null) return;
  const data = read();
  delete bucket(data, userId).rooms[roomId];
  write(data);
}

export function getDraft(userId, key) {
  if (userId == null) return null;
  return bucket(read(), userId).drafts[key] ?? null;
}
export function setDraft(userId, key, value) {
  if (userId == null) return;
  const data = read();
  const drafts = bucket(data, userId).drafts;
  drafts[key] = value;
  // Не даём черновикам расти бесконечно
  const keys = Object.keys(drafts);
  if (keys.length > 40) delete drafts[keys[0]];
  write(data);
}
