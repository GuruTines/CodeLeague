import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, FileSearch, Plus, Search } from 'lucide-react';
import { useCatalog } from '../hooks/useCatalog';
import { useAuth } from '../context/AuthContext';
import TaskDetail from '../components/task/TaskDetail';
import { Badge, Button, EmptyState, Spinner } from '../components/ui';

const firstLine = (text = '') => text.split('\n').find((l) => l.trim()) || '';

export default function Catalog() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { tasks, loading, error, errorStatus, reload } = useCatalog();
  const { openAuth } = useAuth();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => `${t.id} ${t.title} ${t.description || ''}`.toLowerCase().includes(q));
  }, [tasks, query]);

  const selected = tasks.find((t) => String(t.id) === taskId) || null;

  return (
    <div className="container page">
      <header className="page-head">
        <div>
          <h1>Каталог задач</h1>
          <p>Откройте задачу, чтобы прочитать условие и посмотреть примеры. Выбрать задачи для раунда можно при создании комнаты.</p>
        </div>
      </header>

      {loading ? <div className="page-center"><Spinner label="Загружаем задачи" /></div> : null}
      {error ? (
        <EmptyState
          icon={FileSearch}
          title={errorStatus === 401 ? 'Каталог доступен после входа' : 'Не удалось загрузить каталог'}
          text={errorStatus === 401 ? 'Войдите в аккаунт, чтобы смотреть задачи.' : error}
          action={errorStatus === 401
            ? <Button variant="primary" onClick={() => openAuth('login', reload)}>Войти</Button>
            : <Button onClick={reload}>Повторить</Button>}
        />
      ) : null}

      {!loading && !error ? (
        <div className={`catalog ${taskId ? 'has-selection' : ''}`}>
          <aside className="catalog-list">
            <div className="search">
              <Search size={16} />
              <input placeholder="Поиск по названию или номеру" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по каталогу" />
            </div>
            {tasks.length === 0 ? (
              <EmptyState icon={FileSearch} title="Каталог пуст" text="В таблице tasks пока нет ни одной задачи." />
            ) : (
              <ul>
                {filtered.map((t) => (
                  <li key={t.id}>
                    <Link to={`/tasks/${t.id}`} className={`catalog-item ${String(t.id) === taskId ? 'active' : ''}`}>
                      <div className="catalog-item-top">
                        <strong>{t.title}</strong>
                        <small>#{t.id}</small>
                      </div>
                      <p>{firstLine(t.description)}</p>
                      {t.difficulty ? <Badge tone="violet">{t.difficulty}</Badge> : null}
                    </Link>
                  </li>
                ))}
                {filtered.length === 0 ? <li className="picker-empty">По запросу «{query}» ничего нет</li> : null}
              </ul>
            )}
          </aside>

          <section className="catalog-view">
            {selected ? (
              <>
                <Button className="catalog-back" variant="quiet" size="sm" icon={ChevronLeft} onClick={() => navigate('/tasks')}>Все задачи</Button>
                <TaskDetail
                  key={selected.id}
                  task={selected}
                  actions={(
                    <Button as={Link} to={`/rooms/new?task=${selected.id}`} variant="primary" icon={Plus}>Создать комнату с этой задачей</Button>
                  )}
                />
              </>
            ) : taskId ? (
              <EmptyState icon={FileSearch} title="Задача не найдена" text="Проверьте номер или выберите задачу из списка." />
            ) : (
              <EmptyState icon={FileSearch} title="Выберите задачу" text="Слева — список. Здесь появится условие, лимиты и примеры." />
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}