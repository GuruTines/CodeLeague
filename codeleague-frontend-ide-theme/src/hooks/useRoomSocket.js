import { useCallback, useEffect, useRef, useState } from 'react';
import { wsUrl } from '../api/client';

const MAX_ATTEMPTS = 6;

// WebSocket комнаты: /rooms/{id}/ws. Бэкенд присылает
// { type: 'chat' | 'user_joined' | 'user_left', room_id, user_id, payload }
// и принимает { type: 'chat', payload: string } (до 4000 символов).
export function useRoomSocket(roomId, { enabled = true, onMessage } = {}) {
  const [state, setState] = useState('connecting'); // connecting | open | reconnecting | closed
  const [epoch, setEpoch] = useState(0);
  const socketRef = useRef(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!enabled || !roomId) return undefined;
    let stopped = false;
    let attempt = 0;
    let timer;

    const connect = () => {
      setState(attempt === 0 ? 'connecting' : 'reconnecting');
      let socket;
      try { socket = new WebSocket(wsUrl(`/rooms/${roomId}/ws`)); } catch { setState('closed'); return; }
      socketRef.current = socket;

      socket.onopen = () => { attempt = 0; setState('open'); };
      socket.onmessage = (event) => {
        try { handlerRef.current?.(JSON.parse(event.data)); } catch { /* игнорируем мусор */ }
      };
      socket.onclose = () => {
        if (stopped) return;
        socketRef.current = null;
        attempt += 1;
        if (attempt > MAX_ATTEMPTS) { setState('closed'); return; }
        setState('reconnecting');
        timer = setTimeout(connect, Math.min(800 * 2 ** attempt, 12000));
      };
      socket.onerror = () => { /* после ошибки всегда приходит close */ };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      const s = socketRef.current;
      socketRef.current = null;
      if (s) { s.onclose = null; s.close(); }
    };
  }, [roomId, enabled, epoch]);

  const send = useCallback((type, payload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type, payload }));
    return true;
  }, []);

  const reconnect = useCallback(() => setEpoch((n) => n + 1), []);

  return { state, send, reconnect };
}
