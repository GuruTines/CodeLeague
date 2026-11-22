import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Globe, ListChecks, Lock, Users } from 'lucide-react';
import { createRoom, addRoomTasks } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { upsertLocalRoom } from '../store/localState';
import SelectedTasks from '../components/task/SelectedTasks';
import { Badge, Button, Field, Segmented } from '../components/ui';
import { LIMITS } from '../lib/languages';
import { plural } from '../lib/format';

export default function CreateRoom() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselected = Number(params.get('task'));

  const [title, setTitle] = useState('');
  const [capacity, setCapacity] = useState(6);
  const [isPrivate, setIsPrivate] = useState(true);
  const [taskIds, setTaskIds] = useState(Number.isInteger(preselected) && preselected > 0 ? [preselected] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);

  const titleLen = useMemo(() => [...title.trim()].length, [title]);
  const titleError = titleLen < 3 ? 'Название — минимум 3 символа' : titleLen > 128 ? 'Название — не больше 128 символов' : '';

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (titleError || busy) return;
    setBusy(true);
    setError('');
    let room;
    try {
      room = await createRoom({ title: title.trim(), isPrivate, capacity });
    } catch (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    let tasks = [];
    if (taskIds.length) {
      try {
        tasks = (await addRoomTasks(room.id, taskIds)) || [];
      } catch (err) {
        toast.error(`Комната создана, но задачи не добавились: ${err.message}. Добавьте их внутри комнаты.`);
      }
    }
    upsertLocalRoom(user.id, {
      id: room.id, title: room.title, is_private: room.is_private, capacity: room.capacity, is_admin: true,
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, is_success: false }))
    });
    toast.success('Комната готова — пригласите команду');
    navigate(`/rooms/${room.id}`);
  };

  return (
    <div className="container page">
      <header className="page-head">
        <div>
          <h1>Новая комната</h1>
          <p>Вы станете её администратором: запускаете раунды, добавляете задачи и отмечаете решённые.</p>
        </div>
      </header>

      <div className="create-grid">
        <form className="form-sections" onSubmit={submit} noValidate>
          <section>
            <h2>Основное</h2>
            <Field label="Название" htmlFor="room-title" error={touched ? titleError : ''} hint="Например: «Разбор алгоритмов, четверг»">
              <input
                id="room-title" className="input" value={title} maxLength={128}
                onChange={(e) => setTitle(e.target.value)} onBlur={() => setTouched(true)} autoFocus
              />
            </Field>

            <Field label={`Количество мест: ${capacity}`} htmlFor="room-capacity" hint="Считая вас. В комнату войдут только столько человек.">
              <input
                id="room-capacity" type="range" className="range"
                min={LIMITS.roomCapacity.min} max={LIMITS.roomCapacity.max} value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
              />
              <div className="range-scale"><span>{LIMITS.roomCapacity.min}</span><span>{LIMITS.roomCapacity.max}</span></div>
            </Field>

            <Field label="Кто может войти">
              <Segmented
                label="Доступ" value={isPrivate ? 'private' : 'public'} onChange={(v) => setIsPrivate(v === 'private')}
                options={[
                  { value: 'private', label: 'Только по ссылке', icon: Lock },
                  { value: 'public', label: 'Открытая', icon: Globe }
                ]}
              />
              <p className="field-msg">
                {isPrivate
                  ? 'Войти можно только по ссылке-приглашению.'
                  : 'Войти можно по ссылке или из списка открытых комнат.'}
              </p>
            </Field>
          </section>

          <section>
            <h2>Задачи <span className="muted">необязательно, их можно добавить позже</span></h2>
            <SelectedTasks value={taskIds} onChange={setTaskIds} />
          </section>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <div className="form-actions">
            <Button type="submit" variant="primary" size="lg" loading={busy}>Создать комнату</Button>
            <Button variant="quiet" size="lg" onClick={() => navigate(-1)} disabled={busy}>Отмена</Button>
          </div>
        </form>

        <aside className="create-preview" aria-label="Предпросмотр комнаты">
          <p className="create-preview-label">Так комната будет выглядеть</p>
          <div className="room-card room-card-static">
            <div className="room-card-main">
              <h3>{title.trim() || 'Название комнаты'}</h3>
              <div className="room-card-meta">
                {isPrivate ? <Badge icon={Lock}>Закрытая</Badge> : <Badge icon={Globe}>Открытая</Badge>}
                <Badge tone="violet">Вы администратор</Badge>
                <Badge icon={Users}>1 из {capacity}</Badge>
                <Badge icon={ListChecks}>{taskIds.length} {plural(taskIds.length, 'задача', 'задачи', 'задач')}</Badge>
              </div>
            </div>
          </div>
          <p className="muted small">После создания вы получите ссылку-приглашение и попадёте в комнату.</p>
        </aside>
      </div>
    </div>
  );
}
