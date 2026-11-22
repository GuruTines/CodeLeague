import React, { useState } from 'react';
import { Check, ListChecks, Play, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, EmptyState } from '../../components/ui';
import ConfirmModal from '../../components/ui/ConfirmModal';

export default function TasksPanel({ tasks, round, isAdmin, onOpen, onAdd, onStart, onMarkSolved, onRemove }) {
  const [removing, setRemoving] = useState(null);
  const solved = tasks.filter((t) => t.is_success).length;
  const canStart = isAdmin && !round;

  return (
    <section className="panel" aria-label="Задачи комнаты">
      <header className="panel-head">
        <h2>Задачи</h2>
        <div className="row gap-sm">
          {tasks.length ? <Badge tone={solved === tasks.length ? 'ok' : 'neutral'}>{solved} из {tasks.length}</Badge> : null}
          {isAdmin ? <Button size="sm" variant="ghost" icon={Plus} onClick={onAdd} aria-label="Добавить задачи" title="Добавить задачи" /> : null}
        </div>
      </header>

      {tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks} title="В комнате пока нет задач"
          text={isAdmin ? 'Выберите задачи из каталога — они появятся у всех участников.' : 'Администратор ещё не добавил задачи.'}
          action={isAdmin ? <Button variant="primary" icon={Plus} onClick={onAdd}>Добавить задачи</Button> : null}
        />
      ) : (
        <ul className="tasks">
          {tasks.map((t) => {
            const active = round && round.task_id === t.id;
            return (
              <li key={t.id} className={`task ${t.is_success ? 'solved' : ''} ${active ? 'active' : ''}`}>
                <span className="task-state" aria-label={t.is_success ? 'Решена' : active ? 'Решается сейчас' : 'Не решена'}>
                  {t.is_success ? <Check size={13} /> : active ? <Play size={11} /> : null}
                </span>
                <button type="button" className="task-title" onClick={() => onOpen(t)}>
                  {t.title}
                  {active ? <small>решается сейчас</small> : null}
                </button>
                {isAdmin ? (
                  <span className="task-actions">
                    {canStart && !t.is_success ? <Button variant="quiet" size="sm" icon={Play} aria-label={`Начать решение: ${t.title}`} title="Начать решение" onClick={() => onStart(t)} /> : null}
                    {!t.is_success ? <Button variant="quiet" size="sm" icon={Check} aria-label={`Отметить решённой: ${t.title}`} title="Отметить решённой" onClick={() => onMarkSolved(t)} /> : null}
                    <Button variant="quiet" size="sm" icon={Trash2} aria-label={`Убрать из комнаты: ${t.title}`} title="Убрать из комнаты" disabled={Boolean(active)} onClick={() => setRemoving(t)} />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmModal
        open={Boolean(removing)} danger title="Убрать задачу из комнаты?" confirmLabel="Убрать"
        text={removing ? `«${removing.title}» исчезнет из списка комнаты. В каталоге она останется.` : ''}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { await onRemove(removing); setRemoving(null); }}
      />
    </section>
  );
}
