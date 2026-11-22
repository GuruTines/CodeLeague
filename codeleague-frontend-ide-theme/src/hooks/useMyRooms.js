import { useCallback, useEffect, useState } from 'react';
import { getMyRooms } from '../api/rooms';

export function useMyRooms() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMyRooms();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      setRooms([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const forget = useCallback((roomId) => {
    setRooms((list) => list.filter((r) => r.id !== roomId));
  }, []);

  return { rooms, loading, error, reload: load, forget };
}