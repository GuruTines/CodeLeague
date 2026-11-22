import { useEffect, useState } from 'react';
import { getTask } from '../api/tasks';

// Дотягивает подробности задачи (примеры ввода/вывода), если бэкенд умеет GET /tasks/{id}.
// Если эндпоинта нет — остаётся то, что уже известно (id, title, description).
export function useTaskDetails(task) {
  const [details, setDetails] = useState(task);
  const taskId = task?.id;
  const hasSamples = Boolean(task?.samples);

  useEffect(() => {
    setDetails(task);
    if (!task || hasSamples) return undefined;
    let alive = true;
    getTask(task.id)
      .then((full) => { if (alive && full && typeof full === 'object') setDetails({ ...task, ...full }); })
      .catch(() => { /* эндпоинта нет или задача недоступна — показываем как есть */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, hasSamples]);

  return details;
}
