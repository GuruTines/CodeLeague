import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Hourglass, Send } from 'lucide-react';
import CodeEditor from './CodeEditor';
import VerdictBadge from './VerdictBadge';
import TaskDetail from '../../components/task/TaskDetail';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { Badge, Button, EmptyState, CopyButton } from '../../components/ui';
import { LANGUAGES, VERDICTS, getLanguage } from '../../lib/languages';
import { buildStarter } from '../../lib/starter';
import { formatClock, plural } from '../../lib/format';
import { useCountdown } from '../../hooks/useCountdown';
import { getDraft, setDraft } from '../../store/localState';
import { submitSolution } from '../../api/rounds';
import { useToast } from '../../context/ToastContext';

export function Timer({ round, onExpire }) {
  const { remaining, progress, expired } = useCountdown(round);
  useEffect(() => { if (expired) onExpire?.(); }, [expired]); // eslint-disable-line react-hooks/exhaustive-deps
  const low = remaining > 0 && remaining < 60000;
  return (
    <div className={`timer ${low ? 'low' : ''} ${expired ? 'done' : ''}`} role="timer" aria-label="Осталось времени">
      <Clock3 size={16} />
      <strong>{expired ? 'Время вышло' : formatClock(remaining)}</strong>
      <span className="timer-bar"><i style={{ width: `${Math.max(0, progress) * 100}%` }} /></span>
    </div>
  );
}

// Индивидуальная область решения (п. 5 плана): время, условие, примеры, редактор.
export default function SolvePanel({ roomId, user, round, mySubmission, submittedCount, memberCount, onSubmitted, refresh }) {
  const toast = useToast();
  const [language, setLanguage] = useState(() => getDraft(user.id, 'lang') || 'go');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lang = getLanguage(language);
  const draftKey = `${round.id}:${language}`;
  // Решение — функция: шаблон строится из сигнатуры задачи (приходит вместе с раундом).
  const signature = round.task_signature;
  const starter = useMemo(() => buildStarter(language, signature), [language, signature]);

  useEffect(() => {
    setCode(getDraft(user.id, draftKey) ?? starter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, starter]);

  const changeCode = (value) => { setCode(value); setDraft(user.id, draftKey, value); };
  const changeLanguage = (value) => { setLanguage(value); setDraft(user.id, 'lang', value); };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await submitSolution(roomId, round.id, { sourceCode: code, language });
      const verdict = VERDICTS[result?.verdict];
      if (result?.verdict === 'ACCEPTED') toast.success('Решение принято');
      else if (verdict) toast.info(verdict.label);
      else toast.success('Решение отправлено');
      onSubmitted(result);
      setConfirm(false);
    } catch (err) {
      // Бэкенд сохраняет решение до запуска Judge: если проверка упала, решение уже принято
      await refresh();
      setError(err.status === 409
        ? 'Решение уже отправлено.'
        : `Не получилось завершить: ${err.message}`);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  const waiting = useMemo(() => Math.max(0, memberCount - submittedCount), [memberCount, submittedCount]);

  if (mySubmission) {
    return (
      <div className="solve solve-wait">
        <div className="solve-top">
          <h2>{round.task_title}</h2>
          <Timer round={round} onExpire={refresh} />
        </div>
        <EmptyState
          icon={waiting > 0 ? Hourglass : CheckCircle2}
          title={waiting > 0 ? 'Решение отправлено, ждём остальных' : 'Все сдали решения'}
          text={memberCount
            ? `Сдали ${submittedCount} из ${memberCount} в сети. ${waiting > 0 ? `Осталось дождаться ${waiting} ${plural(waiting, 'участника', 'участников', 'участников')} или конца времени.` : 'Раунд завершается.'}`
            : `Сдали: ${submittedCount}. Раунд закончится, когда выйдет время или сдадут все.`}
          action={<div className="row gap center"><Badge>{getLanguage(mySubmission.language).label}</Badge><VerdictBadge submission={mySubmission} /></div>}
        />
        {mySubmission.verdict ? (
          <div className="verdict-card">
            <p className="verdict-card-title">{(VERDICTS[mySubmission.verdict] || { label: mySubmission.verdict }).label}</p>
            <p className="muted small">
              Тесты: {mySubmission.passed_tests ?? 0}/{mySubmission.total_tests ?? 0}
              {mySubmission.execution_time_ms != null ? ` · ${mySubmission.execution_time_ms} мс` : ''}
              {mySubmission.memory_used_kb ? ` · ${mySubmission.memory_used_kb} КБ` : ''}
            </p>
            {mySubmission.compile_output ? <pre className="verdict-log">{mySubmission.compile_output}</pre> : null}
          </div>
        ) : null}
        {mySubmission.source_code ? (
          <details className="my-code">
            <summary>Показать моё решение</summary>
            <CodeEditor value={mySubmission.source_code} readOnly minLines={6} language={mySubmission.language} label="Отправленное решение" />
          </details>
        ) : null}
      </div>
    );
  }

  return (
    <div className="solve">
      <div className="solve-top">
        <h2>{round.task_title}</h2>
        <Timer round={round} onExpire={refresh} />
      </div>
      <div className="solve-split">
        <div className="solve-statement">
          <TaskDetail compact task={{ id: round.task_id, title: round.task_title, description: round.task_description, signature }} />
        </div>
        <div className="solve-editor">
          <div className="editor-bar">
            <div className="lang-picker" role="radiogroup" aria-label="Язык решения">
              {LANGUAGES.map((l) => (
                <button
                  key={l.value} type="button" role="radio" aria-checked={language === l.value}
                  className={language === l.value ? 'active' : ''} onClick={() => changeLanguage(l.value)}
                >
                  <img src={l.logo} alt="" width="16" height="16" className={l.monoOnly ? 'mono' : ''} />
                  {l.label}
                </button>
              ))}
            </div>
            <CopyButton text={code} label="Копировать" />
          </div>
          <CodeEditor value={code} onChange={changeCode} language={language} />
          {!signature ? <p className="form-error" role="alert">У задачи не задана сигнатура функции, поэтому решение нельзя проверить. Сообщите администратору.</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="editor-foot">
            <p>Черновик сохраняется в браузере. После отправки изменить решение нельзя.</p>
            <Button variant="accent" icon={Send} onClick={() => setConfirm(true)} disabled={!code.trim() || !signature}>Завершить решение</Button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirm} title="Завершить решение?" confirmLabel="Отправить" onClose={() => !busy && setConfirm(false)}
        text={`Решение на ${lang.label} уйдёт на проверку. Изменить его после отправки не получится.`}
        onConfirm={submit}
      />
    </div>
  );
}
