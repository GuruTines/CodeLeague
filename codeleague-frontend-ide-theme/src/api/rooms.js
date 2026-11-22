import { request } from './client';

export const createRoom = ({ title, isPrivate, capacity }) =>
  request('/rooms', { method: 'POST', body: { title, is_private: isPrivate, capacity } });

export const deleteRoom = (roomId) => request(`/rooms/${roomId}`, { method: 'DELETE' });

export const joinRoom = (roomId) => request(`/rooms/${roomId}/users`, { method: 'POST' });

// Возвращает ВСЕ задачи комнаты (id, title, description) — без флага is_success
export const addRoomTasks = (roomId, taskIds) =>
  request(`/rooms/${roomId}/tasks`, { method: 'POST', body: { tasks_id: taskIds } });

export const removeRoomTasks = (roomId, taskIds) =>
  request(`/rooms/${roomId}/tasks`, { method: 'DELETE', body: { tasks_id: taskIds } });

export const markTaskSolved = (roomId, taskId) =>
  request(`/rooms/${roomId}/tasks/${taskId}`, { method: 'PATCH' });

export const getRoom = (roomId) => request(`/rooms/${roomId}`);
export const getMyRooms = () => request('/me/rooms');
export const getPublicRooms = () => request('/rooms');
