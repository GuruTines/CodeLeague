import { useEffect, useRef } from 'react';

// Периодически вызывает fn (сразу и затем каждые ms), пока вкладка видима.
// Нужен, потому что WebSocket бэкенда пока не сообщает о старте/конце раунда.
export function usePolling(fn, ms, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    const tick = () => { if (!stopped && !document.hidden) fnRef.current(); };
    tick();
    const id = setInterval(tick, ms);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [ms, enabled]);
}
