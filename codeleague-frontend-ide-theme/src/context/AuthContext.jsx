import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as authApi from '../api/auth';
import { getStoredUser, setStoredUser } from '../store/localState';
import { useToast } from './ToastContext';
import AuthModal from '../components/auth/AuthModal';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready
  const [modal, setModal] = useState({ open: false, mode: 'login' });
  const afterAuth = useRef(null);
  const userRef = useRef(null);
  userRef.current = user;

  // Восстановление сессии при загрузке страницы.
  // GET /me на бэкенде пока нет — тогда доверяем сохранённому пользователю, а если
  // кука на самом деле истекла, первый же защищённый запрос вернёт 401 (см. ниже).
  useEffect(() => {
    let alive = true;
    (async () => {
      let next = null;
      try {
        next = await authApi.getMe();
        setStoredUser(next);
      } catch (err) {
        if (err.status === 401) {
          setStoredUser(null);
          next = null;
        } else {
          // эндпоинта нет (isMissing), бэкенд недоступен или другая ошибка
          next = getStoredUser();
        }
      }
      if (alive) { setUser(next); setStatus('ready'); }
    })();
    return () => { alive = false; };
  }, []);

  // Любой защищённый запрос с ответом 401 = сессия закончилась.
  useEffect(() => {
    const onUnauthorized = () => {
      if (!userRef.current) return;
      userRef.current = null;
      setUser(null);
      setStoredUser(null);
      toast.info('Сессия закончилась — войдите снова');
      setModal({ open: true, mode: 'login' });
    };
    window.addEventListener('cl:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cl:unauthorized', onUnauthorized);
  }, [toast]);

  const openAuth = useCallback((mode = 'login', onSuccess = null) => {
    afterAuth.current = onSuccess;
    setModal({ open: true, mode });
  }, []);
  const closeAuth = useCallback(() => { afterAuth.current = null; setModal((m) => ({ ...m, open: false })); }, []);

  const submit = useCallback(async (mode, { username, password }) => {
    const fn = mode === 'login' ? authApi.login : authApi.register;
    const result = await fn(username.trim(), password);
    setUser(result);
    setStoredUser(result);
    setModal((m) => ({ ...m, open: false }));
    toast.success(mode === 'login' ? `С возвращением, ${result.username}` : `Аккаунт ${result.username} создан`);
    const cb = afterAuth.current;
    afterAuth.current = null;
    if (cb) cb(result);
    return result;
  }, [toast]);

  const signOut = useCallback(async () => {
    try { await authApi.logout(); } catch { /* сессия могла уже истечь — не страшно */ }
    userRef.current = null;
    setUser(null);
    setStoredUser(null);
    toast.info('Вы вышли из аккаунта');
  }, [toast]);

  const value = useMemo(
    () => ({ user, status, openAuth, signOut }),
    [user, status, openAuth, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal open={modal.open} initialMode={modal.mode} onClose={closeAuth} onSubmit={submit} />
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
