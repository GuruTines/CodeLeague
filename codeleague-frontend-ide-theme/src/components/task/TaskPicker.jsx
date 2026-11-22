import React, { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { useCatalog } from '../../hooks/useCatalog';
import { Badge, Button, Spinner } from '../ui';

const firstLine = (text = '') => text.split('\n').find((l) => l.trim()) || '';

export default function TaskPicker({ value, onChange, exclude = [] }) {
  const { tasks, loading, error, reload } = useCatalog();
  const [query, setQuery] = useState('');

  const available = useMemo(() => {
    const skip = new Set(exclude);
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => !skip.has(t.id) && (!q || `${t.id} ${t.title} ${t.description || ''}`.toLowerCase().includes(q)));
  }, [tasks, exclude, query]);

  if (loading) return <Spinner label="Загружаем каталог" />;
  if (error) {
    return (
      <div className="notice notice-bad">
        <p>Не удалось загрузить каталог: {error}</p>
        <Button size="sm" onClick={reload}>Повторить</Button>
      </div>
    );
  }

  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="picker">
      <div className="search">
        <Search size={16} />
        <input placeholder="Найти задачу" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по задачам" />
      </div>
      <ul className="picker-list picker-list-tall">
        {available.map((t) => {
          const on = value.includes(t.id);
          return (
            <li key={t.id}>
              <button type="button" className={`picker-item picker-item-rich ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(t.id)}>
                <span className="check">{on ? <Check size={13} /> : null}</span>
                <span className="picker-text">
                  <span className="picker-title">{t.title}</span>
                  <small className="picker-desc">{firstLine(t.description)}</small>
                </span>
                <span className="picker-side">
                  {t.difficulty ? <Badge tone="violet">{t.difficulty}</Badge> : null}
                  <small>#{t.id}</small>
                </span>
              </button>
            </li>
          );
        })}
        {available.length === 0 ? <li className="picker-empty">Ничего не найдено</li> : null}
      </ul>
    </div>
  );
}