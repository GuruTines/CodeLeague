import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveRound, getSubmissions } from '../api/rounds';
import { usePolling } from './usePolling';
import { getLocalRoom, upsertLocalRoom } from '../store/localState';

// Состояние раундов комнаты.
// WebSocket бэкенда пока не сообщает о старте и конце раунда, поэтому опрашиваем
// GET /rounds/active (раз в 3 с во время раунда и раз в 6 с в остальное время).
// Когда раунд заканчивается, GET /rounds/active перестаёт его возвращать, так что
// «последний раунд» запоминаем сами — по нему показываем решения.
export function useRound(roomId, userId, { enabled, onStarted, onFinished } = {}) {
  const [round, setRound] = useState(null);
  const [lastRound, setLastRound] = useState(() => getLocalRoom(userId, roomId)?.last_round || null);
  const [subsByRound, setSubsByRound] = useState({}); // { [roundId]: Submission[] }
  const [loaded, setLoaded] = useState(false);
  const prev = useRef(null);
  const cb = useRef({});
  cb.current = { onStarted, onFinished };

  const loadSubmissions = useCallback(async (roundId) => {
    try {
      const list = await getSubmissions(roomId, roundId);
      setSubsByRound((m) => ({ ...m, [roundId]: Array.isArray(list) ? list : [] }));
    } catch { /* список решений не критичен для опроса */ }
  }, [roomId]);

  const upsertSubmission = useCallback((sub) => {
    if (!sub?.id || !sub.round_id) return;
    setSubsByRound((m) => {
      const list = m[sub.round_id] || [];
      const index = list.findIndex((s) => s.id === sub.id);
      const next = index >= 0 ? list.map((s, i) => (i === index ? { ...s, ...sub } : s)) : [...list, sub];
      return { ...m, [sub.round_id]: next };
    });
  }, []);

  const poll = useCallback(async () => {
    let res;
    try { res = await getActiveRound(roomId); } catch { return; }
    const active = res?.active ? res.round : null;
    const before = prev.current;

    if (before && (!active || active.id !== before.id)) {
      const info = {
        id: before.id, task_id: before.task_id, task_title: before.task_title,
        task_description: before.task_description, started_at: before.started_at, duration_seconds: before.duration_seconds
      };
      setLastRound(info);
      upsertLocalRoom(userId, { id: roomId, last_round: info });
      loadSubmissions(info.id);
      cb.current.onFinished?.(info);
    }
    if (active && (!before || before.id !== active.id)) {
      cb.current.onStarted?.(active, Boolean(before) || loaded);
    }
    prev.current = active;
    setRound(active);
    setLoaded(true);
    if (active) loadSubmissions(active.id);
  }, [roomId, userId, loadSubmissions, loaded]);

  usePolling(poll, round ? 3000 : 6000, enabled);

  // Страница открыта после окончания раунда — подтягиваем его решения один раз
  useEffect(() => {
    if (enabled && lastRound && !round) loadSubmissions(lastRound.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lastRound?.id]);

  return { round, lastRound, subsByRound, loaded, refresh: poll, refreshSubmissions: loadSubmissions, upsertSubmission };
}
