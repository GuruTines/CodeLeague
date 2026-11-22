export const shortId = (id = '') => (id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

export const initials = (name = '?') =>
  name.trim().split(/[\s_.-]+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase() || '?';

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatTime(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatDate(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} с`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} ч ${rest} мин` : `${h} ч`;
}

// Стабильный «цвет» пользователя по id/имени — для аватаров
export function hueFor(key = '') {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export const extractRoomId = (text = '') => (text.match(UUID_RE) || [])[0] || '';

export const inviteLink = (roomId) => `${window.location.origin}/join/${roomId}`;

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
