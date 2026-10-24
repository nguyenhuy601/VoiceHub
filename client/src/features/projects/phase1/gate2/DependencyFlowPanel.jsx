/**
 * Card-flow visualization for Gate2 / HOW Monitor dependency section.
 * Predecessor → condition → Successor (parallel badge when applicable).
 * Cycle dumps stay off this surface. The schedule tool owns the applied critical path.
 */

import { useEffect, useRef, useState } from 'react';
import { buildTaskNameMap, listDependencyDisplayItems, taskShortName } from './dependencyDisplay';

const FLOW_BATCH = 3;

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  const text = value == null || value === '' || value === key ? fallback : value;
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (next, [name, raw]) => next.replace(`{${name}}`, String(raw ?? '')),
    text
  );
}

function readAppliedCriticalPath(container) {
  const cpm = container?.planning?.theoreticalCpm;
  const fromCpm = Array.isArray(cpm?.criticalPath) ? cpm.criticalPath.map(String).filter(Boolean) : [];
  const fromSeq = Array.isArray(container?.planning?.sequence?.criticalPath?.taskIds)
    ? container.planning.sequence.criticalPath.taskIds.map(String).filter(Boolean)
    : [];
  const ids = fromCpm.length ? fromCpm : fromSeq;
  const hours = Number(cpm?.projectDurationHours);
  return { ids, hours: Number.isFinite(hours) ? hours : null };
}

function formatHourCount(hours) {
  if (!Number.isFinite(hours)) return '';
  return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 10) / 10);
}

function AppliedCriticalPath({ container, blocked, t }) {
  const { ids, hours } = readAppliedCriticalPath(container);
  const taskById = buildTaskNameMap(container);
  if (!ids.length) {
    if (!blocked) return null;
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
        <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">
          {labelOf(t, 'requirements.gate2SeqBlocked', 'Chưa tính đường găng')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {labelOf(
            t,
            'requirements.gate2SeqBlockedHint',
            'Chưa thể xác định đường găng hợp lệ cho toàn bộ graph. Hãy kiểm tra các dependency trên chu trình.'
          )}
        </p>
      </div>
    );
  }

  const hourText = formatHourCount(hours);
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold text-foreground">
          {labelOf(t, 'requirements.gate2SeqPathApplied', 'Đường găng sẽ áp dụng')}
        </h4>
        {hourText ? (
          <p className="text-xs text-muted-foreground">
            {labelOf(t, 'requirements.gate2SeqDuration', 'Thời lượng dự án')}:{' '}
            <span className="font-medium text-foreground">
              {labelOf(t, 'requirements.gate2SeqHoursValue', '{hours} giờ', { hours: hourText })}
            </span>
          </p>
        ) : null}
      </div>
      <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto overscroll-contain">
        {ids.map((taskId, index) => (
          <li key={`${taskId}-${index}`} className="text-xs text-foreground">
            <span className="mr-1 font-mono text-[10px] text-muted-foreground">{index + 1}.</span>
            <span className="font-medium">{taskShortName(taskById, taskId)}</span>
            {taskShortName(taskById, taskId) !== taskId ? (
              <span className="ml-1 font-mono text-[10px] text-muted-foreground">{taskId}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function FlowCard({
  roleLabel,
  taskId,
  taskName,
  subtitle,
  parallel,
  t,
}) {
  return (
    <div
      className={`flex h-full min-w-0 flex-col rounded-md border px-3 py-2 ${
        parallel
          ? 'border-sky-500/40 bg-sky-500/5'
          : 'border-border bg-card'
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {roleLabel}
      </p>
      <p className="mt-0.5 text-sm font-medium text-foreground break-words">{taskName}</p>
      {taskId ? (
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{taskId}</p>
      ) : null}
      {subtitle ? (
        <p className="mt-1 text-xs text-muted-foreground break-words">{subtitle}</p>
      ) : null}
      {parallel ? (
        <p className="mt-auto pt-1 text-[10px] font-medium text-sky-700 dark:text-sky-300">
          {labelOf(t, 'requirements.gate2DepParallelBadge', 'Có thể song song')}
        </p>
      ) : null}
    </div>
  );
}

function FlowArrow({ condition, scope, t }) {
  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-center gap-1.5 px-1 py-2 text-center">
      <div className="flex w-full items-center gap-1.5 text-muted-foreground" aria-hidden>
        <span className="h-px min-w-[1rem] flex-1 bg-border" />
        <span>→</span>
        <span className="h-px min-w-[1rem] flex-1 bg-border" />
      </div>
      {condition ? (
        <p className="w-full text-[11px] leading-snug text-muted-foreground break-words">{condition}</p>
      ) : null}
      {scope ? (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase text-foreground">
          {labelOf(t, `requirements.gate2DepScope_${scope}`, scope)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * @param {{ pack?: object, container?: object, rows?: object[], t?: function, className?: string }} props
 */
export default function DependencyFlowPanel({
  pack = null,
  container: containerIn = null,
  rows = null,
  t,
  className = '',
}) {
  const container =
    containerIn ||
    pack?.aiAnalysis ||
    pack?.container ||
    null;

  const { items: fromContainer, unresolvedQuestions } = listDependencyDisplayItems(
    container || {}
  );
  const items =
    Array.isArray(rows) && rows.length
      ? rows.filter((r) => r.predecessorTaskId || r.successorTaskId)
      : fromContainer;
  const sequencing = container?.planning?.sequence;
  const sequencingBlocked = String(sequencing?.status || '').startsWith('BLOCKED');
  const appliedPath = readAppliedCriticalPath(container);
  const [visibleCount, setVisibleCount] = useState(FLOW_BATCH);
  const scrollRef = useRef(null);
  const itemKey = items.map((item) => item.id || `${item.predecessorTaskId}-${item.successorTaskId}`).join('|');

  useEffect(() => {
    setVisibleCount(FLOW_BATCH);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [itemKey]);

  if (!items.length && !unresolvedQuestions.length && !sequencingBlocked && !appliedPath.ids.length) {
    return null;
  }

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  function revealNextBatch(element) {
    if (!hasMore) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
    if (nearBottom) {
      setVisibleCount((count) => Math.min(items.length, count + FLOW_BATCH));
    }
  }

  return (
    <div className={`mt-3 w-full space-y-3 ${className}`.trim()}>
      <AppliedCriticalPath container={container} blocked={sequencingBlocked} t={t} />
      {items.length ? (
        <>
          <div>
            <h4 className="text-xs font-semibold text-foreground">
              {labelOf(t, 'requirements.gate2DepFlowTitle', 'Sơ đồ phụ thuộc')}
            </h4>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {labelOf(
                t,
                'requirements.gate2DepFlowHint',
                'Luồng công việc: task trước → điều kiện → task sau. Badge song song khi có thể phát triển song song.'
              )}
            </p>
          </div>

          <div
            ref={scrollRef}
            className="max-h-72 w-full space-y-2 overflow-y-auto overscroll-contain pr-1"
            onScroll={(event) => revealNextBatch(event.currentTarget)}
            onWheel={(event) => {
              const element = event.currentTarget;
              const canScroll = element.scrollHeight > element.clientHeight + 1;
              if (!canScroll && event.deltaY > 0) {
                setVisibleCount((count) => Math.min(items.length, count + FLOW_BATCH));
              }
            }}
          >
            {visibleItems.map((item) => {
              const parallel = Boolean(item.canWorkInParallel);
              const condition =
                item.requiredInputLabel ||
                item.parallelCondition ||
                item.reason ||
                item.title;
              return (
                <div
                  key={item.id || `${item.predecessorTaskId}-${item.successorTaskId}`}
                  className="grid w-full grid-cols-1 items-stretch gap-2 rounded-md border border-border/60 bg-muted/20 p-2 sm:grid-cols-[minmax(0,1.15fr)_minmax(9rem,0.9fr)_minmax(0,1.15fr)]"
                >
                  <FlowCard
                    roleLabel={labelOf(t, 'requirements.gate2DepPredRole', 'Task trước')}
                    taskId={item.predecessorTaskId}
                    taskName={item.predecessorName || item.predecessorTaskId}
                    subtitle={null}
                    parallel={false}
                    t={t}
                  />
                  <FlowArrow condition={condition} scope={item.blockingScope} t={t} />
                  <FlowCard
                    roleLabel={labelOf(t, 'requirements.gate2DepSuccRole', 'Task sau')}
                    taskId={item.successorTaskId}
                    taskName={item.successorName || item.successorTaskId}
                    subtitle={item.reason || item.title}
                    parallel={parallel}
                    t={t}
                  />
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {unresolvedQuestions.length > 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
            {labelOf(t, 'requirements.gate2DepUnresolvedTitle', 'Câu hỏi chưa giải quyết')}
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {unresolvedQuestions.slice(0, 12).map((q, i) => (
              <li key={`${q.taskId || 'q'}-${i}`}>
                {q.taskId ? <span className="font-mono">{q.taskId}: </span> : null}
                {q.question}
                {q.whyItMatters ? (
                  <span className="text-muted-foreground"> — {q.whyItMatters}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
