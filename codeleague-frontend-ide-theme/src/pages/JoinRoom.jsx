import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DoorOpen, Link2 as LinkIcon } from 'lucide-react';
import { getActiveRound } from '../api/rounds';
import { joinRoom } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getLocalRoom, upsertLocalRoom } from '../store/localState';
import { Button, EmptyState, Spinner } from '../components/ui';
import { extractRoomId, shortId } from '../lib/format';

export default function JoinRoom() {
  const { roomId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const valid = extractRoomId(roomId) === roomId;
  const [phase, setPhase] = useState(valid ? 'checking' : 'invalid'); // checking | ready | joining
  const [error, setError] = useState('');

  // Если пользователь уже в комнате — сразу заходим. Повторное вступление
  // бэкенд обрабатывает как ошибку 500, поэтому проверяем членство заранее:
  // GET .../rounds/active отвечает 200 участнику и 403 не-участнику.
  useEffect(() => {
    if (!valid) return undefined;
    let alive = true;
    getActiveRound(roomId)
      .then(() => { if (alive) navigate(`/rooms/${roomId}`, { replace: true }); })
      .catch((err) => {
        if (!alive) return;
        if (err.status === 403) setPhase('ready');
        else { setError(err.message); setPhase('ready'); }
      });
    return () => { alive = false; };
  }, [roomId, valid, navigate]);

  const join = async () => {
    setPhase('joining');
    setError('');
    try {
      await joinRoom(roomId);
      if (!getLocalRoom(user.id, roomId)) upsertLocalRoom(user.id, { id: roomId, title: `Комната ${shortId(roomId)}`, is_admin: false });
      toast.success('Вы в комнате');
      navigate(`/rooms/${roomId}`, { replace: true });
    } catch (err) {
      setError(err.status === 500
        ? 'Не удалось войти. Проверьте ссылку: возможно, комнаты не существует.'
        : err.message);
      setPhase('ready');
    }
  };

  if (phase === 'invalid') {
    return (
      <div className="page-center">
        <EmptyState
          icon={LinkIcon} title="Ссылка не похожа на приглашение"
          text="В адресе должен быть ID комнаты. Попросите администратора отправить ссылку ещё раз."
          action={<Button as={Link} to="/profile" variant="primary">В профиль</Button>}
        />
      </div>
    );
  }
  if (phase === 'checking') return <div className="page-center"><Spinner label="Проверяем приглашение" /></div>;

  return (
    <div className="page-center">
      <div className="join-card">
        <span className="empty-icon"><DoorOpen size={22} /></span>
        <h1>Вас пригласили в комнату</h1>
        <p>Комната <code>{shortId(roomId)}</code>. Вы войдёте как <strong>{user.username}</strong>.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="row gap center">
          <Button variant="primary" size="lg" loading={phase === 'joining'} onClick={join}>Присоединиться</Button>
          <Button as={Link} to="/profile" variant="quiet" size="lg">Не сейчас</Button>
        </div>
      </div>
    </div>
  );
}
