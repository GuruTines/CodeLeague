import { useCallback, useEffect, useRef, useState } from 'react';
import { addRoomTasks, getRoom, markTaskSolved, removeRoomTasks } from '../api/rooms';
import { getLocalRoom, upsertLocalRoom } from '../store/localState';
import { shortId } from '../lib/format';

export function useRoom(roomId, user) {
  const [state, setState] = useState(() => {
    const local = getLocalRoom(user.id, roomId);
    return {
      status: 'loading', source: null, error: '',
      meta: { title: local?.title || `Комната ${shortId(roomId)}`, is_private: local?.is_private, capacity: local?.capacity },
      members: [], tasks: local?.tasks || [], isAdmin: Boolean(local?.is_admin)
    };
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(async () => {
    try {
      const data = await getRoom(roomId);
      const members = Array.isArray(data.members) ? data.members : [];
      const me = members.find((m) => String(m.user_id) === String(user.id));
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      const meta = { title: data.title, is_private: data.is_private, capacity: data.capacity };
      upsertLocalRoom(user.id, { id: roomId, ...meta, is_admin: Boolean(me?.is_admin), tasks });
      setState({ status: 'ready', source: 'api', error: '', meta, members, tasks, isAdmin: Boolean(me?.is_admin) });
    } catch (err) {
      if (err.status === 403) setState((s) => ({ ...s, status: 'forbidden' }));
      else if (err.status === 404) setState((s) => ({ ...s, status: 'notfound' }));
      else setState((s) => ({ ...s, status: 'error', error: err.message }));
    }
  }, [roomId, user.id]);

  useEffect(() => { load(); }, [load]);

  const persistTasks = useCallback((tasks) => {
    upsertLocalRoom(user.id, { id: roomId, tasks });
    setState((s) => ({ ...s, tasks }));
  }, [roomId, user.id]);

  const addTasks = useCallback(async (ids) => {
    const result = (await addRoomTasks(roomId, ids)) || [];
    const solved = new Set(stateRef.current.tasks.filter((t) => t.is_success).map((t) => t.id));
    persistTasks(result.map((t) => ({ id: t.id, title: t.title, description: t.description, is_success: solved.has(t.id) })));
    load();
  }, [roomId, persistTasks, load]);

  const removeTask = useCallback(async (id) => {
    await removeRoomTasks(roomId, [id]);
    persistTasks(stateRef.current.tasks.filter((t) => t.id !== id));
  }, [roomId, persistTasks]);

  const markSolved = useCallback(async (id) => {
    await markTaskSolved(roomId, id);
    persistTasks(stateRef.current.tasks.map((t) => (t.id === id ? { ...t, is_success: true } : t)));
  }, [roomId, persistTasks]);

  return { ...state, reload: load, actions: { addTasks, removeTask, markSolved } };
}