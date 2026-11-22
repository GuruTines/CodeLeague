import React from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, EmptyState, Spinner } from '../ui';

export default function RequireAuth({ children, title = 'Нужен аккаунт', text = 'Войдите или создайте аккаунт, чтобы продолжить.' }) {
  const { user, status, openAuth } = useAuth();
  if (status === 'loading') return <div className="page-center"><Spinner /></div>;
  if (user) return children;
  return (
    <div className="page-center">
      <EmptyState
        icon={Lock} title={title} text={text}
        action={(
          <div className="row gap">
            <Button variant="primary" onClick={() => openAuth('login')}>Войти</Button>
            <Button variant="ghost" onClick={() => openAuth('register')}>Создать аккаунт</Button>
          </div>
        )}
      />
    </div>
  );
}
