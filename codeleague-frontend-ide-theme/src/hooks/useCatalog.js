import { useCallback, useEffect, useState } from 'react';
import { listTasks } from '../api/tasks';

let cache = null;
export function useCatalog() {
  const [state, setState] = useState(() => cache || { tasks: [] });
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setErrorStatus(0);
    try {
      const data = await listTasks();
      cache = { tasks: Array.isArray(data) ? data : [] };
      setState(cache);
    } catch (err) {
      setError(err.message);
      setErrorStatus(err.status);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!cache) load(); }, [load]);

  return { ...state, loading, error, errorStatus, reload: load };
}

export const invalidateCatalog = () => { cache = null; };