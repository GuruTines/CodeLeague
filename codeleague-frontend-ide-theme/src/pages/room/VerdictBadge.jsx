import React from 'react';
import { Badge } from '../../components/ui';
import { VERDICTS } from '../../lib/languages';

// Показывает вердикт Judge, только если бэкенд его отдал в ответе
// (см. BACKEND_TODO.md, пункт про вердикты). Ничего не выдумываем.
export default function VerdictBadge({ submission }) {
  if (!submission?.verdict) return null;
  const v = VERDICTS[submission.verdict] || { label: submission.verdict, tone: 'neutral' };
  const tests = submission.total_tests ? ` ${submission.passed_tests ?? 0}/${submission.total_tests}` : '';
  const extra = [];
  if (submission.execution_time_ms) extra.push(`${submission.execution_time_ms} мс`);
  if (submission.memory_used_kb) extra.push(`${submission.memory_used_kb} КБ`);
  const suffix = extra.length ? ` · ${extra.join(' · ')}` : '';
  return <Badge tone={v.tone}>{v.label}{tests}{suffix}</Badge>;
}
