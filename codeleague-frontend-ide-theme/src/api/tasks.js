import { request } from './client';

// ОПЦИОНАЛЬНО: GET /tasks и GET /tasks/{id} на бэкенде пока нет (см. BACKEND_TODO.md)
export const listTasks = () => request('/tasks');
export const getTask = (taskId) => request(`/tasks/${taskId}`);
