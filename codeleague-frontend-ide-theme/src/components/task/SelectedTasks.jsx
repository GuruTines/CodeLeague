import React, { useEffect, useState } from 'react';
import { ListPlus, X } from 'lucide-react';
import Modal from '../ui/Modal';
import TaskPicker from './TaskPicker';
import { Button } from '../ui';
import { useCatalog } from '../../hooks/useCatalog';
import { plural } from '../../lib/format';

// Блок «Задачи» в форме: список выбранных и кнопка, открывающая окно выбора.
export default function SelectedTasks({ value, onChange }) {
  const { tasks } = useCatalog();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (open) setDraft(value); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const titleOf = (id) => tasks.find((t) => t.id === id)?.title;

  return (
    <div className="selected-tasks">
      {value.length === 0 ? (
        <p className="selected-empty">Задачи не выбраны. Можно создать комнату без них и добавить позже.</p>
      ) : (
        <ul className="selected-list">
          {value.map((id) => (
            <li key={id}>
              <span className="selected-title">{titleOf(id) || `Задача #${id}`}</span>
              <small>#{id}</small>
              <button type="button" className="icon-btn" aria-label={`Убрать задачу ${titleOf(id) || id}`} onClick={() => onChange(value.filter((x) => x !== id))}>
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button variant="ghost" icon={ListPlus} onClick={() => setOpen(true)}>
          {value.length ? 'Изменить выбор' : 'Выбрать задачи'}
        </Button>
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)} title="Выбор задач" subtitle="Отметьте задачи, которые попадут в комнату." width={620}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={() => { onChange(draft); setOpen(false); }}>
              {draft.length ? `Готово: ${draft.length} ${plural(draft.length, 'задача', 'задачи', 'задач')}` : 'Готово'}
            </Button>
          </>
        )}
      >
        <TaskPicker value={draft} onChange={setDraft} />
      </Modal>
    </div>
  );
}
