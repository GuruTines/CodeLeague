// Базовый адрес API. В dev Vite проксирует /api -> Go-бэкенд (см. vite.config.js),
// в проде это должен делать nginx/ingress. Можно переопределить через VITE_API_BASE.
export const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    // Go-мультиплексор на неизвестный маршрут отвечает text/plain "404 page not found",
    // а на неверный метод — 405. Ответы самого приложения — всегда JSON с полем message.
    // Так мы отличаем «эндпоинта ещё нет на бэкенде» от «запись не найдена».
    this.missingEndpoint = status === 405 || (status === 404 && typeof data === 'string');
  }
}

// Поправка часов: разница между временем сервера (заголовок Date) и браузера.
// Нужна, чтобы таймер раунда не «уезжал», если часы клиента спешат или отстают.
let clockOffset = 0;
export const serverNow = () => Date.now() + clockOffset;

export async function request(path, { method = 'GET', body, signal, silent401 = false } = {}) {
  const hasBody = body !== undefined;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Нет связи с сервером. Проверьте, что бэкенд запущен.', 0, null);
  }

  const dateHeader = response.headers.get('Date');
  if (dateHeader) {
    const t = Date.parse(dateHeader);
    if (!Number.isNaN(t)) {
      // Date отдаётся с точностью до секунды, поэтому мелкие расхождения игнорируем
      const diff = t - Date.now();
      clockOffset = Math.abs(diff) < 2500 ? 0 : diff;
    }
  }

  // Бэкенд не выставляет Content-Type, поэтому читаем как текст и парсим сами.
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && data.message) ||
      (typeof data === 'string' && data.trim()) ||
      `Ошибка ${response.status}`;
    const error = new ApiError(message, response.status, data);
    if (response.status === 401 && !silent401) {
      window.dispatchEvent(new CustomEvent('cl:unauthorized'));
    }
    throw error;
  }
  return data;
}

export const isMissing = (err) => Boolean(err && err.missingEndpoint);

export function wsUrl(path) {
  const base = API_BASE.startsWith('http')
    ? API_BASE.replace(/^http/, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${API_BASE}`;
  return `${base}${path}`;
}
