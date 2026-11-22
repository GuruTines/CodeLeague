import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DoorOpen, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useMyRooms } from '../hooks/useMyRooms';
import { deleteRoom, getPublicRooms } from '../api/rooms';
import RoomCard from '../components/RoomCard';
import ConfirmModal from '../components/ui/ConfirmModal';
import { Avatar, Button, EmptyState, Spinner } from '../components/ui';
import { extractRoomId, formatDate } from '../lib/format';

export default function Profile() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { rooms, loading, error, reload, forget } = useMyRooms(user.id);
  const [publicRooms, setPublicRooms] = useState(null); // null — эндпоинта нет
  const [toDelete, setToDelete] = useState(null);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    getPublicRooms().then((d) => setPublicRooms(Array.isArray(d) ? d : null)).catch(() => setPublicRooms(null));
  }, []);

  const mine = useMemo(() => rooms.filter((r) => r.is_admin), [rooms]);
  const joined = useMemo(() => rooms.filter((r) => !r.is_admin), [rooms]);
  const tabs = [
    { key: 'mine', label: 'Созданные мной', list: mine },
    { key: 'joined', label: 'Я участвую', list: joined },
    ...(publicRooms ? [{ key: 'public', label: 'Открытые комнаты', list: publicRooms.filter((r) => !rooms.some((m) => m.id === r.id)) }] : [])
  ];
  const requested = params.get('tab');
  const active = tabs.find((t) => t.key === requested) || tabs[0];

  const confirmDelete = async () => {
    try {
      await deleteRoom(toDelete.id);
      forget(toDelete.id);
      toast.success(`Комната «${toDelete.title}» удалена`);
      setToDelete(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const go = (e) => {
    e.preventDefault();
    const id = extractRoomId(link);
    if (!id) { setLinkError('Не нашли ID комнаты. Вставьте ссылку-приглашение целиком.'); return; }
    navigate(`/join/${id}`);
  };

  return (
    <div className="container page">
      <header className="profile-head">
        <Avatar name={user.username} id={user.id} size={64} />
        <div className="profile-id">
          <h1>{user.username}</h1>
          <p>{user.created_at ? `В CodeLeague с ${formatDate(user.created_at)}` : `Пользователь #${user.id}`}</p>
        </div>
        <div className="profile-stats">
          <div><strong>{mine.length}</strong><span>создано</span></div>
          <div><strong>{joined.length}</strong><span>участвую</span></div>
        </div>
        <Button as={Link} to="/rooms/new" variant="primary" icon={Plus}>Создать комнату</Button>
      </header>

      <form className="join-inline" onSubmit={go}>
        <input
          className="input" value={link} aria-label="Ссылка-приглашение"
          placeholder="Есть ссылка-приглашение? Вставьте её сюда"
          onChange={(e) => { setLink(e.target.value); setLinkError(''); }}
        />
        <Button type="submit" variant="ghost" disabled={!link.trim()}>Перейти</Button>
        {linkError ? <p className="field-msg field-msg-error">{linkError}</p> : null}
      </form>

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key} type="button" role="tab" aria-selected={active.key === t.key}
            className={active.key === t.key ? 'active' : ''} onClick={() => setParams({ tab: t.key })}
          >
            {t.label} <span className="tab-count">{t.list.length}</span>
          </button>
        ))}
        <span className="tabs-spacer" />
        <Button variant="quiet" size="sm" icon={RefreshCw} onClick={reload} aria-label="Обновить список">Обновить</Button>
      </div>

      {error ? <div className="notice notice-bad"><p>{error}</p></div> : null}

      {loading ? (
        <div className="page-center"><Spinner label="Загружаем комнаты" /></div>
      ) : active.list.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title={active.key === 'mine' ? 'Вы ещё не создавали комнат' : active.key === 'joined' ? 'Вы пока ни в одной комнате' : 'Открытых комнат нет'}
          text={active.key === 'mine' ? 'Создайте комнату и отправьте ссылку команде.' : 'Когда вас пригласят, комната появится здесь.'}
          action={active.key === 'mine' ? <Button as={Link} to="/rooms/new" variant="primary" icon={Plus}>Создать комнату</Button> : null}
        />
      ) : (
        <div className="room-list">
          {active.list.map((r) => (
            <RoomCard key={r.id} room={r} joinOnly={active.key === 'public'} onDelete={setToDelete} />
          ))}
        </div>
      )}

      <ConfirmModal
        open={Boolean(toDelete)} danger title="Удалить комнату?" confirmLabel="Удалить"
        text={toDelete ? `«${toDelete.title}» будет удалена вместе с задачами и участниками. Это нельзя отменить.` : ''}
        onConfirm={confirmDelete} onClose={() => setToDelete(null)}
      />
    </div>
  );
}
