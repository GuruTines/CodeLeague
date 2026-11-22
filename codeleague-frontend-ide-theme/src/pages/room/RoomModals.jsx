import React, { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import TaskPicker from '../../components/task/TaskPicker';
import TaskDetail from '../../components/task/TaskDetail';
import { Button, Segmented } from '../../components/ui';
import { LIMITS } from '../../lib/languages';
import { formatDuration } from '../../lib/format';

export function AddTasksModal({ open, onClose, existingIds, onAdd }) {
  const [ids, setIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setIds([]); setError(''); } }, [open]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try { await onAdd(ids); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal
      open={open} onClose={onClose} title="Добавить задачи" subtitle="Выбранные задачи появятся у всех участников комнаты." width={560}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!ids.length}>
            {ids.length ? `Добавить (${ids.length})` : 'Добавить'}
          </Button>
        </>
      )}
    >
      <TaskPicker value={ids} onChange={setIds} exclude={existingIds} />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </Modal>
  );
}

const PRESETS = [5, 10, 15, 30, 45, 60, 90];

export function StartRoundModal({ open, onClose, tasks, initialTaskId, onStart }) {
  const candidates = tasks.filter((t) => !t.is_success);
  const [taskId, setTaskId] = useState(null);
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTaskId(initialTaskId ?? candidates[0]?.id ?? tasks[0]?.id ?? null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTaskId]);

  const seconds = Math.round(Number(minutes) * 60);
  const secondsOk = seconds >= LIMITS.roundSeconds.min && seconds <= LIMITS.roundSeconds.max;

  const submit = async () => {
    setBusy(true);
    setError('');
    try { await onStart({ taskId, durationSeconds: seconds }); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open} onClose={onClose} title="Начать решение" subtitle="Все участники получат задачу и таймер одновременно." width={520}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button variant="accent" onClick={submit} loading={busy} disabled={!taskId || !secondsOk}>Запустить раунд</Button>
        </>
      )}
    >
      <div className="stack">
        <fieldset className="fieldset">
          <legend>Задача</legend>
          <ul className="picker-list">
            {tasks.map((t) => (
              <li key={t.id}>
                <label className={`radio-row ${taskId === t.id ? 'on' : ''}`}>
                  <input type="radio" name="round-task" checked={taskId === t.id} onChange={() => setTaskId(t.id)} />
                  <span className="picker-title">{t.title}</span>
                  {t.is_success ? <small>уже решена</small> : <small>#{t.id}</small>}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Время на решение</legend>
          <Segmented
            label="Время" value={PRESETS.includes(Number(minutes)) ? Number(minutes) : null} onChange={setMinutes}
            options={PRESETS.map((m) => ({ value: m, label: `${m} мин` }))}
          />
          <div className="inline-field">
            <label htmlFor="round-minutes">Своё значение, минут</label>
            <input
              id="round-minutes" className="input input-sm" type="number" min="1" max={LIMITS.roundSeconds.max / 60} step="1"
              value={minutes} onChange={(e) => setMinutes(e.target.value)}
            />
            <span className="muted small">{secondsOk ? formatDuration(seconds) : 'От 1 до 120 минут'}</span>
          </div>
        </fieldset>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </div>
    </Modal>
  );
}

export function TaskModal({ task, onClose }) {
  return (
    <Modal open={Boolean(task)} onClose={onClose} title={task?.title || ''} width={720}>
      {task ? <TaskDetail task={task} compact /> : null}
    </Modal>
  );
}
