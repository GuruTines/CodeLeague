import React from 'react';
import { Crown, Check, Clock3, Play } from 'lucide-react';
import { Avatar } from '../ui';

// Иллюстрация комнаты для лендинга. Это статичная картинка из HTML — не живые данные.
const MEMBERS = [
  { name: 'anna_dev', id: 1, admin: true, online: true },
  { name: 'dmitry', id: 2, online: true },
  { name: 'lena.k', id: 3, online: true },
  { name: 'timur', id: 4, online: false }
];
const TASKS = [
  { t: 'Сумма двух чисел', done: true },
  { t: 'Палиндром', done: true },
  { t: 'Два числа с заданной суммой', active: true },
  { t: 'Скобочная последовательность' }
];

export default function RoomPreview() {
  return (
    <div className="preview" aria-hidden="true">
      <div className="preview-bar">
        <span className="dots"><i /><i /><i /></span>
        <strong>Разбор алгоритмов, четверг</strong>
        <span className="preview-timer"><Clock3 size={13} /> 12:48</span>
      </div>
      <div className="preview-body">
        <aside className="preview-col">
          <h4>Участники</h4>
          {MEMBERS.map((m) => (
            <div key={m.id} className="preview-member">
              <Avatar name={m.name} id={m.id} size={26} />
              <span>{m.name}</span>
              {m.admin ? <Crown size={13} className="crown" /> : null}
              <i className={`presence ${m.online ? 'on' : ''}`} />
            </div>
          ))}
        </aside>
        <section className="preview-board">
          <div className="preview-msg">
            <Avatar name="anna_dev" id={1} size={26} />
            <div>
              <b>anna_dev</b>
              <p>Переношу решение Димы на доску — давайте обсудим сложность.</p>
              <pre>{`def two_sum(a, target):
    seen = {}
    for i, x in enumerate(a):
        if target - x in seen:
            return seen[target - x], i
        seen[x] = i`}</pre>
            </div>
          </div>
          <div className="preview-msg">
            <Avatar name="lena.k" id={3} size={26} />
            <div>
              <b>lena.k</b>
              <p>O(n) по времени, а у меня вышло O(n²) через два цикла.</p>
            </div>
          </div>
        </section>
        <aside className="preview-col">
          <h4>Задачи</h4>
          {TASKS.map((t) => (
            <div key={t.t} className={`preview-task ${t.active ? 'active' : ''}`}>
              <span className={`tick ${t.done ? 'done' : ''}`}>{t.done ? <Check size={11} /> : t.active ? <Play size={9} /> : null}</span>
              {t.t}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
