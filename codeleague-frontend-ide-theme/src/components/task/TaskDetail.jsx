import React from 'react';
import { Cpu, Timer } from 'lucide-react';
import RichText from '../ui/RichText';
import { Badge, CopyButton } from '../ui';
import { LIMITS } from '../../lib/languages';
import { useTaskDetails } from '../../hooks/useTaskDetails';

export function Samples({ samples }) {
  if (!samples?.length) return null;
  return (
    <section className="samples">
      <h3>Примеры</h3>
      {samples.map((s, i) => (
        <div className="sample" key={i}>
          <div>
            <div className="sample-head"><span>Ввод</span><CopyButton text={s.input} /></div>
            <pre>{s.input}</pre>
          </div>
          <div>
            <div className="sample-head"><span>Вывод</span><CopyButton text={s.expected_output} /></div>
            <pre>{s.expected_output}</pre>
          </div>
        </div>
      ))}
    </section>
  );
}

// Условие задачи: заголовок, лимиты, текст и примеры.
export default function TaskDetail({ task, compact = false, actions = null }) {
  const full = useTaskDetails(task);
  if (!full) return null;
  return (
    <article className={`task-detail ${compact ? 'compact' : ''}`}>
      <header className="task-detail-head">
        <div>
          <h2>{full.title}</h2>
          <div className="task-meta">
            <Badge title="Номер задачи в каталоге">#{full.id}</Badge>
            {full.difficulty ? <Badge tone="violet">{full.difficulty}</Badge> : null}
            {(full.tags || []).map((t) => <Badge key={t}>{t}</Badge>)}
            <Badge icon={Timer} title="Лимит времени на один тест">{LIMITS.timeMs / 1000} с</Badge>
            <Badge icon={Cpu} title="Лимит памяти">{LIMITS.memoryMb} МБ</Badge>
          </div>
        </div>
        {actions ? <div className="task-detail-actions">{actions}</div> : null}
      </header>
      <RichText text={full.description} />
      <Samples samples={full.samples} />
    </article>
  );
}
