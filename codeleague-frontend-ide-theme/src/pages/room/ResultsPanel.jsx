import React, { useEffect, useMemo, useState } from 'react';
import { Check, FileCode2, Presentation, UserX } from 'lucide-react';
import CodeEditor from './CodeEditor';
import VerdictBadge from './VerdictBadge';
import { Avatar, Badge, Button, CopyButton, EmptyState } from '../../components/ui';
import { getLanguage } from '../../lib/languages';
import { formatTime } from '../../lib/format';

// Просмотр решений после раунда (п. 6 плана) + перенос на доску и отметка «решено» для администратора.
export default function ResultsPanel({ lastRound, submissions, members, nameOf, isAdmin, taskSolved, onTransfer, onMarkSolved, user }) {
  const [selectedId, setSelectedId] = useState(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!selectedId && submissions.length) setSelectedId(submissions[0].id);
  }, [submissions, selectedId]);

  const selected = submissions.find((s) => s.id === selectedId) || null;
  const missing = useMemo(() => {
    const sent = new Set(submissions.map((s) => String(s.user_id)));
    return members.filter((m) => !sent.has(String(m.user_id)));
  }, [members, submissions]);

  if (!lastRound) {
    return <EmptyState icon={FileCode2} title="Решений пока нет" text="Они появятся здесь, когда закончится первый раунд." />;
  }

  return (
    <div className="results">
      <div className="solve-top">
        <div>
          <h2>{lastRound.task_title}</h2>
          <p className="muted small">Раунд завершён. Решения открыты для всех участников.</p>
        </div>
        {isAdmin ? (
          taskSolved ? (
            <Badge tone="ok" icon={Check}>Задача решена</Badge>
          ) : (
            <Button
              variant="primary" icon={Check} loading={marking}
              onClick={async () => { setMarking(true); try { await onMarkSolved(lastRound.task_id); } finally { setMarking(false); } }}
            >
              Отметить задачу решённой
            </Button>
          )
        ) : taskSolved ? <Badge tone="ok" icon={Check}>Задача решена</Badge> : null}
      </div>

      {submissions.length === 0 ? (
        <EmptyState icon={FileCode2} title="Никто не сдал решение" text="В этом раунде нет ни одной отправки." />
      ) : (
        <div className="results-split">
          <ul className="results-list" aria-label="Участники, сдавшие решение">
            {submissions.map((s) => (
              <li key={s.id}>
                <button type="button" className={`results-item ${s.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(s.id)}>
                  <Avatar name={nameOf(s.user_id, s.username)} id={s.user_id} size={30} />
                  <span className="results-item-text">
                    <strong>{nameOf(s.user_id, s.username)}{String(s.user_id) === String(user.id) ? ' (вы)' : ''}</strong>
                    <small>{getLanguage(s.language).label}, {formatTime(s.submitted_at)}</small>
                  </span>
                  <VerdictBadge submission={s} />
                </button>
              </li>
            ))}
            {missing.length ? (
              <li className="results-missing">
                <UserX size={14} /> Не сдали: {missing.map((m) => nameOf(m.user_id)).join(', ')}
              </li>
            ) : null}
          </ul>

          {selected ? (
            <div className="results-view">
              <div className="results-view-head">
                <div className="row gap">
                  <Avatar name={nameOf(selected.user_id, selected.username)} id={selected.user_id} size={30} />
                  <div>
                    <strong>{nameOf(selected.user_id, selected.username)}</strong>
                    <div className="muted small">{getLanguage(selected.language).label}</div>
                  </div>
                </div>
                <div className="row gap">
                  <CopyButton text={selected.source_code} label="Копировать" variant="ghost" />
                  {isAdmin ? (
                    <Button variant="accent" size="sm" icon={Presentation} onClick={() => onTransfer(selected)}>Перенести на доску</Button>
                  ) : null}
                </div>
              </div>
              <CodeEditor value={selected.source_code} readOnly minLines={10} language={selected.language} label="Решение участника" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
