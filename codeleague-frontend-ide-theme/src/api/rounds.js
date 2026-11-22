import { request } from './client';

export const startRound = (roomId, { taskId, durationSeconds }) =>
  request(`/rooms/${roomId}/rounds`, {
    method: 'POST',
    body: { task_id: Number(taskId), duration_seconds: Number(durationSeconds) }
  });

// -> { active: boolean, round: Round | null }. Заодно это проверка членства в комнате:
// 403 = пользователь не состоит в комнате.
export const getActiveRound = (roomId, signal) => request(`/rooms/${roomId}/rounds/active`, { signal });

export const submitSolution = (roomId, roundId, { sourceCode, language }) =>
  request(`/rooms/${roomId}/rounds/${roundId}/submissions`, {
    method: 'POST',
    body: { source_code: sourceCode, language }
  });

export const getSubmissions = (roomId, roundId, signal) =>
  request(`/rooms/${roomId}/rounds/${roundId}/submissions`, { signal });
