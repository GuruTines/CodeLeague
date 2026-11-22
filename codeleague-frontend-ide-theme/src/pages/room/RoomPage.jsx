import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Crown, DoorClosed, Globe, ListChecks, Lock, MessageSquare, Play, Trash2, Trophy, Users, Wifi, WifiOff, Code2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useRoom } from '../../hooks/useRoom';
import { useRound } from '../../hooks/useRound';
import { useRoomSocket } from '../../hooks/useRoomSocket';
import { deleteRoom } from '../../api/rooms';
import { startRound } from '../../api/rounds';
import { removeLocalRoom } from '../../store/localState';
import { Badge, Button, EmptyState, Spinner } from '../../components/ui';
import ConfirmModal from '../../components/ui/ConfirmModal';
import MembersPanel from './MembersPanel';
import BoardPanel from './BoardPanel';
import TasksPanel from './TasksPanel';
import SolvePanel, { Timer } from './SolvePanel';
import ResultsPanel from './ResultsPanel';
import { AddTasksModal, StartRoundModal, TaskModal } from './RoomModals';
import { LIMITS } from '../../lib/languages';

export default function RoomPage() {
  const { roomId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const room = useRoom(roomId, user);
  const ready = room.status === 'ready';

  const [tab, setTab] = useState('board');          // board | solve | results
  const [pane, setPane] = useState('center');       // только для узких экранов
  const [messages, setMessages] = useState([]);
  const [online, setOnline] = useState(() => new Set());
  const [seen, setSeen] = useState(() => new Set());
  const [names, setNames] = useState({});
  const [modal, setModal] = useState(null);         // { type: 'add' | 'start' | 'task' | 'delete', ... }
  const counter = useRef(0);
  const refreshRef = useRef(() => {});
  const reloadRef = useRef(() => {});

  const round = useRound(roomId, user.id, {
    enabled: ready,
    onStarted: (r, announce) => {
      setTab('solve');
      if (announce) toast.info(`Начался раунд: ${r.task_title}`);
    },
    onFinished: () => { setTab('results'); toast.info('Раунд завершён — решения открыты'); }
  });
  refreshRef.current = round.refresh;
  reloadRef.current = room.reload;

  const pushMessage = useCallback((m) => {
    counter.current += 1;
    setMessages((list) => [...list.slice(-299), { id: counter.current, at: new Date().toISOString(), ...m }]);
  }, []);

  const onSocket = useCallback((msg) => {
    const uid = String(msg.user_id);
    const mine = uid === String(user.id);
    if (msg.username) {
      setNames((prev) => (prev[uid] === msg.username ? prev : { ...prev, [uid]: msg.username }));
    }
    if (msg.type === 'chat') {
      pushMessage({ kind: 'chat', userId: uid, text: msg.payload });
      setSeen((s) => new Set(s).add(uid));
    } else if (msg.type === 'user_joined') {
      setOnline((s) => new Set(s).add(uid));
      setSeen((s) => new Set(s).add(uid));
      if (!mine) pushMessage({ kind: 'system', event: 'user_joined', userId: uid });
    } else if (msg.type === 'user_left') {
      setOnline((s) => { const n = new Set(s); n.delete(uid); return n; });
      if (!mine) pushMessage({ kind: 'system', event: 'user_left', userId: uid });
    } else if (msg.type === 'presence') {
      // Предлагаемое событие (см. BACKEND_TODO.md): список id, кто сейчас в комнате
      try { setOnline(new Set(JSON.parse(msg.payload).map(String))); } catch { /* ignore */ }
    } else if (String(msg.type).startsWith('round')) {
      refreshRef.current();
      reloadRef.current();
    } else if (msg.type === 'room_updated') {
      reloadRef.current();
    }
  }, [pushMessage, user.id]);

  const socket = useRoomSocket(roomId, { enabled: ready, onMessage: onSocket });

  const people = useMemo(() => {
    if (room.members.length) {
      return [...room.members]
        .map((m) => ({ user_id: m.user_id, username: m.username || `Участник #${m.user_id}`, is_admin: m.is_admin }))
        .sort((a, b) => Number(b.is_admin) - Number(a.is_admin));
    }
    const list = [{ user_id: user.id, username: user.username, is_admin: room.isAdmin }];
    seen.forEach((id) => { if (id !== String(user.id)) list.push({ user_id: id, username: `Участник #${id}`, is_admin: false }); });
    return list;
  }, [room.members, room.isAdmin, seen, user]);

  const nameOf = useCallback((id, fallback) => {
    const p = people.find((x) => String(x.user_id) === String(id));
    if (p?.username && !String(p.username).startsWith('Участник #')) return p.username;
    if (fallback) return fallback;
    if (names[String(id)]) return names[String(id)];
    return p ? p.username : `Участник #${id}`;
  }, [people, names]);

  const onlineSet = useMemo(() => {
    const s = new Set(online);
    if (socket.state === 'open') s.add(String(user.id));
    return s;
  }, [online, socket.state, user.id]);

  const activeSubs = round.round ? round.subsByRound[round.round.id] || [] : [];
  const lastSubs = round.lastRound ? round.subsByRound[round.lastRound.id] || [] : [];
  const mySubmission = activeSubs.find((s) => String(s.user_id) === String(user.id)) || null;
  const submittedIds = new Set(activeSubs.map((s) => String(s.user_id)));
  const activeCount = people.filter((p) => onlineSet.has(String(p.user_id)) || submittedIds.has(String(p.user_id))).length;
  const lastTask = round.lastRound ? room.tasks.find((t) => t.id === round.lastRound.task_id) : null;

  const send = (text) => socket.send('chat', text);

  const transfer = (sub) => {
    const header = `Решение участника ${nameOf(sub.user_id, sub.username)} (${sub.language}):\n`;
    const budget = LIMITS.chatPayload - header.length - 20;
    let code = sub.source_code;
    if (code.length > budget) {
      code = `${code.slice(0, budget - 24)}\n… (код обрезан)`;
      toast.info('Решение длиннее 4000 символов — на доску перенесено начало.');
    }
    if (send(`${header}\`\`\`${sub.language}\n${code}\n\`\`\``)) { setTab('board'); setPane('center'); toast.success('Решение перенесено на доску'); }
    else toast.error('Нет соединения с комнатой — решение не перенесено.');
  };

  const doStart = async ({ taskId, durationSeconds }) => {
    await startRound(roomId, { taskId, durationSeconds });
    await round.refresh();
    toast.success('Раунд запущен');
  };

  const markSolved = async (task) => {
    try { await room.actions.markSolved(task.id); toast.success(`«${task.title}» отмечена решённой`); } catch (err) { toast.error(err.message); }
  };

  const doDelete = async () => {
    try {
      await deleteRoom(roomId);
      removeLocalRoom(user.id, roomId);
      toast.success('Комната удалена');
      navigate('/profile');
    } catch (err) { toast.error(err.message); setModal(null); }
  };

  if (room.status === 'loading') return <div className="page-center"><Spinner label="Заходим в комнату" /></div>;
  if (room.status === 'forbidden') {
    return (
      <div className="page-center">
        <EmptyState
          icon={DoorClosed} title="Вы не участник этой комнаты" text="Войти можно по ссылке-приглашению от администратора."
          action={<Button as={Link} to={`/join/${roomId}`} variant="primary">Присоединиться</Button>}
        />
      </div>
    );
  }
  if (room.status === 'notfound' || room.status === 'error') {
    return (
      <div className="page-center">
        <EmptyState
          icon={DoorClosed} title={room.status === 'notfound' ? 'Комната не найдена' : 'Не удалось открыть комнату'}
          text={room.status === 'notfound' ? 'Возможно, администратор её удалил.' : room.error}
          action={<div className="row gap"><Button onClick={room.reload}>Повторить</Button><Button as={Link} to="/profile" variant="ghost">В профиль</Button></div>}
        />
      </div>
    );
  }

  const conn = { open: ['Подключено', 'ok', Wifi], connecting: ['Подключаемся', 'neutral', WifiOff], reconnecting: ['Переподключаемся', 'warn', WifiOff], closed: ['Нет связи', 'bad', WifiOff] }[socket.state];
  const startBlocked = !room.tasks.length ? 'Сначала добавьте задачи' : round.round ? 'Раунд уже идёт' : '';

  const tabs = [
    { key: 'board', label: 'Доска', icon: MessageSquare, show: true },
    { key: 'solve', label: 'Моё решение', icon: Code2, show: Boolean(round.round) },
    { key: 'results', label: 'Решения', icon: Trophy, show: Boolean(round.lastRound) }
  ].filter((t) => t.show);
  const currentTab = tabs.some((t) => t.key === tab) ? tab : 'board';

  return (
    <div className="room">
      <div className="room-bar">
        <div className="room-title">
          <h1>{room.meta.title}</h1>
          <div className="row gap-sm">
            {room.meta.is_private != null ? (
              <Badge icon={room.meta.is_private ? Lock : Globe}>{room.meta.is_private ? 'Закрытая' : 'Открытая'}</Badge>
            ) : null}
            {room.isAdmin ? <Badge tone="violet" icon={Crown}>Вы администратор</Badge> : null}
            <Badge tone={conn[1]} icon={conn[2]}>{conn[0]}</Badge>
          </div>
        </div>
        <div className="room-actions">
          {round.round ? (
            <button type="button" className="round-chip" onClick={() => { setTab('solve'); setPane('center'); }}>
              <span>Идёт раунд: {round.round.task_title}</span>
              <Timer round={round.round} onExpire={round.refresh} />
            </button>
          ) : null}
          {room.isAdmin ? (
            <>
              <Button variant="accent" icon={Play} disabled={Boolean(startBlocked)} title={startBlocked || 'Выбрать задачу и время'} onClick={() => setModal({ type: 'start' })}>Начать решение</Button>
              <Button variant="quiet" icon={Trash2} aria-label="Удалить комнату" title="Удалить комнату" onClick={() => setModal({ type: 'delete' })} />
            </>
          ) : null}
        </div>
      </div>

      <div className="pane-switch" role="tablist" aria-label="Раздел комнаты">
        {[['members', 'Участники', Users], ['center', 'Доска', MessageSquare], ['tasks', 'Задачи', ListChecks]].map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={pane === k} className={pane === k ? 'active' : ''} onClick={() => setPane(k)}><Icon size={16} />{label}</button>
        ))}
      </div>

      <div className="room-grid" data-pane={pane}>
        <div className="col col-members">
          <MembersPanel roomId={roomId} meta={room.meta} people={people} online={onlineSet} myId={user.id} />
        </div>

        <section className="col col-center" aria-label="Центр комнаты">
          <div className="tabs tabs-flush" role="tablist">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={currentTab === t.key} className={currentTab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>
          <div className="center-body">
            {currentTab === 'board' ? (
              <BoardPanel messages={messages} nameOf={nameOf} myId={user.id} socketState={socket.state} onSend={send} onReconnect={socket.reconnect} />
            ) : null}
            {currentTab === 'solve' && round.round ? (
              <SolvePanel
                key={round.round.id} roomId={roomId} user={user} round={round.round} mySubmission={mySubmission}
                submittedCount={activeSubs.length} memberCount={room.members.length}
                onSubmitted={(result) => { round.upsertSubmission(result); round.refreshSubmissions(round.round.id); round.refresh(); }}
                refresh={async () => { await round.refresh(); await round.refreshSubmissions(round.round.id); }}
              />
            ) : null}
            {currentTab === 'results' && round.lastRound ? (
              <ResultsPanel
                lastRound={round.lastRound} submissions={lastSubs} members={room.members} nameOf={nameOf} user={user}
                isAdmin={room.isAdmin} taskSolved={Boolean(lastTask?.is_success)}
                onTransfer={transfer} onMarkSolved={(id) => markSolved({ id, title: round.lastRound.task_title })}
              />
            ) : null}
          </div>
        </section>

        <div className="col col-tasks">
          <TasksPanel
            tasks={room.tasks} round={round.round} isAdmin={room.isAdmin}
            onOpen={(t) => setModal({ type: 'task', task: t })}
            onAdd={() => setModal({ type: 'add' })}
            onStart={(t) => setModal({ type: 'start', taskId: t.id })}
            onMarkSolved={markSolved}
            onRemove={async (t) => { try { await room.actions.removeTask(t.id); } catch (err) { toast.error(err.message); } }}
          />
        </div>
      </div>

      <AddTasksModal open={modal?.type === 'add'} onClose={() => setModal(null)} existingIds={room.tasks.map((t) => t.id)} onAdd={async (ids) => { await room.actions.addTasks(ids); toast.success('Задачи добавлены'); }} />
      <StartRoundModal open={modal?.type === 'start'} onClose={() => setModal(null)} tasks={room.tasks} initialTaskId={modal?.taskId} onStart={doStart} />
      <TaskModal task={modal?.type === 'task' ? modal.task : null} onClose={() => setModal(null)} />
      <ConfirmModal
        open={modal?.type === 'delete'} danger title="Удалить комнату?" confirmLabel="Удалить комнату"
        text="Комната исчезнет у всех участников вместе с задачами. Это нельзя отменить."
        onConfirm={doDelete} onClose={() => setModal(null)}
      />
    </div>
  );
}
