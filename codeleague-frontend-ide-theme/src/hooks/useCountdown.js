import { useEffect, useMemo, useState } from 'react';
import { serverNow } from '../api/client';

// Go отдаёт время с наносекундами; обрезаем до миллисекунд, чтобы Date.parse работал везде.
export const parseTime = (value) => Date.parse(String(value).replace(/(\.\d{3})\d+/, '$1'));

export function useCountdown(round) {
  const roundId = round?.id;
  const end = useMemo(
    () => (round ? parseTime(round.started_at) + round.duration_seconds * 1000 : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roundId, round?.started_at, round?.duration_seconds]
  );
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    if (!end) return undefined;
    setNow(serverNow());
    const id = setInterval(() => setNow(serverNow()), 500);
    return () => clearInterval(id);
  }, [end]);

  const total = round ? round.duration_seconds * 1000 : 0;
  const remaining = end ? Math.max(0, end - now) : 0;
  return { remaining, total, progress: total ? remaining / total : 0, expired: end != null && remaining <= 0 };
}
