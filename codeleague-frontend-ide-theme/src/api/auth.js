import { request, ApiError } from './client';

// Бэкенд отдаёт разные тексты для одной и той же ошибки (например, при входе
// с несуществующим логином приходит "user already exists"), поэтому
// сообщения для пользователя строим по статусу, а не по тексту сервера.
function authError(err, mode) {
  if (!(err instanceof ApiError) || err.status === 0) return err;
  if (mode === 'login') {
    if (err.status === 400 || err.status === 401) {
      return new ApiError('Неверное имя пользователя или пароль', err.status, err.data);
    }
  } else {
    if (err.status === 409) return new ApiError('Это имя уже занято — выберите другое', err.status, err.data);
    if (err.status === 400) return new ApiError('Проверьте имя и пароль: они не подходят под требования', err.status, err.data);
  }
  return err;
}

export const register = (username, password) =>
  request('/register', { method: 'POST', body: { username, password }, silent401: true })
    .catch((e) => { throw authError(e, 'register'); });

export const login = (username, password) =>
  request('/login', { method: 'POST', body: { username, password }, silent401: true })
    .catch((e) => { throw authError(e, 'login'); });

export const logout = () => request('/logout', { method: 'DELETE', silent401: true });

// ОПЦИОНАЛЬНО: GET /me — на бэкенде пока нет (см. BACKEND_TODO.md)
export const getMe = () => request('/me', { silent401: true });

// Те же правила, что и в service/auth.go — чтобы подсказать ошибку до отправки формы
export function validateCredentials({ username, password }) {
  const u = [...username.trim()].length;
  const rules = {
    usernameLen: u >= 3 && u <= 128,
    passwordLen: [...password].length >= 8 && [...password].length <= 64,
    passwordChars: /^[A-Za-z0-9]*$/.test(password),
    passwordLetter: /[A-Za-z]/.test(password),
    passwordDigit: /[0-9]/.test(password)
  };
  return { rules, ok: Object.values(rules).every(Boolean) };
}
