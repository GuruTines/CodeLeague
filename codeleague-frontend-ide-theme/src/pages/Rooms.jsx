import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen, Plus, RefreshCw } from 'lucide-react';
import { getPublicRooms } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import { useMyRooms } from '../hooks/useMyRooms';
import { usePolling } from '../hooks/usePolling';
import RoomCard from '../components/RoomCard';
import { Button, EmptyState, Spinner, Switch } from '../components/ui';

const REFRESH_MS = 10000;

const isMine = (r) => Boolean(r.is_admin);

export default function Rooms() {
  const { user } = useAuth();
  const { rooms: mine } = useMyRooms(user.id);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hideMine, setHideMine] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const data = await getPublicRooms();
      setRooms(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message);
      if (!silent) setRooms([]);
    } finally {
      loadedOnce.current = true; 
      if (!silent) setLoading(false);
    }
  }, []);

  usePolling(() => load(loadedOnce.current), REFRESH_MS);

  const joinedIds = useMemo(() => new Set(mine.map((r) => r.id)), [mine]);
  const isMember = (r) => Boolean(r.is_member || r.is_admin || joinedIds.has(r.id));

  const visible = useMemo(() => (hideMine ? rooms.filter((r) => !isMine(r)) : rooms), [rooms, hideMine]);
  const myCount = useMemo(() => rooms.filter(isMine).length, [rooms]);

  return (
    <div className="container page">
      <header className="page-head">
        <div>
          <h1>Открытые комнаты</h1>
          <p>Все комнаты, в которые можно зайти без приглашения, — список одинаков для всех. Ваши комнаты отмечены «Создана вами». Закрытые комнаты сюда не попадают — в них только по ссылке.</p>
        </div>
        <div className="row gap">
          <Button variant="quiet" icon={RefreshCw} onClick={() => load(false)} aria-label="Обновить список">Обновить</Button>
          <Button as={Link} to="/rooms/new" variant="primary" icon={Plus}>Создать комнату</Button>
        </div>
      </header>

      {error ? <div className="notice notice-bad"><p>{error}</p></div> : null}

      {myCount > 0 ? (
        <Switch
          checked={hideMine}
          onChange={setHideMine}
          label="Скрыть созданные мной"
          description={`Ваших открытых комнат: ${myCount}`}
        />
      ) : null}

      {loading ? (
        <div className="page-center"><Spinner label="Загружаем комнаты" /></div>
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="Открытых комнат пока нет"
          text="Создайте комнату и снимите галочку «закрытая» — она появится в этом списке."
          action={<Button as={Link} to="/rooms/new" variant="primary" icon={Plus}>Создать комнату</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="Чужих открытых комнат пока нет"
          text="Все открытые комнаты созданы вами. Выключите «Скрыть созданные мной», чтобы увидеть их."
        />
      ) : (
        <div className="room-list">
          {visible.map((r) => (
            <RoomCard
              key={r.id}
              room={r}
              joinOnly={!isMember(r)}
              ownLabel="Создана вами"
              showMembership
            />
          ))}
        </div>
      )}
    </div>
  );
}