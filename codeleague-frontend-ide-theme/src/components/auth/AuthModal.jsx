import React, { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Circle } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button, Field } from '../ui';
import { validateCredentials } from '../../api/auth';

const RULES = [
  { key: 'usernameLen', text: 'Имя: от 3 символов' },
  { key: 'passwordLen', text: 'Пароль: от 8 до 64 символов' },
  { key: 'passwordChars', text: 'Только латинские буквы и цифры' },
  { key: 'passwordLetter', text: 'Хотя бы одна буква' },
  { key: 'passwordDigit', text: 'Хотя бы одна цифра' }
];

export default function AuthModal({ open, initialMode = 'login', onClose, onSubmit }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setMode(initialMode); setError(''); setPassword(''); setShow(false); }
  }, [open, initialMode]);

  const isRegister = mode === 'register';
  const { rules, ok } = validateCredentials({ username, password });
  const canSubmit = isRegister ? ok : username.trim().length > 0 && password.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(mode, { username, password });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open} onClose={onClose} width={440}
      title={isRegister ? 'Создайте аккаунт' : 'Войдите в CodeLeague'}
      subtitle={isRegister ? 'Нужен только логин и пароль — почта не требуется.' : 'Чтобы создавать комнаты и решать задачи с командой.'}
    >
      <div className="tabs tabs-pill" role="tablist">
        <button type="button" role="tab" aria-selected={!isRegister} className={!isRegister ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Вход</button>
        <button type="button" role="tab" aria-selected={isRegister} className={isRegister ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Регистрация</button>
      </div>

      <form onSubmit={submit} className="stack">
        <Field label="Имя пользователя" htmlFor="auth-username">
          <input
            id="auth-username" className="input" autoComplete="username" value={username}
            onChange={(e) => setUsername(e.target.value)} placeholder="например, anna_dev" maxLength={128}
          />
        </Field>
        <Field label="Пароль" htmlFor="auth-password">
          <div className="input-wrap">
            <input
              id="auth-password" className="input" type={show ? 'text' : 'password'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} maxLength={64}
            />
            <button type="button" className="icon-btn input-affix" aria-label={show ? 'Скрыть пароль' : 'Показать пароль'} onClick={() => setShow((s) => !s)}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </Field>

        {isRegister ? (
          <ul className="rules">
            {RULES.map((r) => (
              <li key={r.key} className={rules[r.key] ? 'met' : ''}>
                {rules[r.key] ? <Check size={14} /> : <Circle size={10} />}
                {r.text}
              </li>
            ))}
          </ul>
        ) : null}

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!canSubmit} className="btn-block">
          {isRegister ? 'Создать аккаунт' : 'Войти'}
        </Button>
      </form>
    </Modal>
  );
}
