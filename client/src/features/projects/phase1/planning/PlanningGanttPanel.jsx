import { useEffect, useMemo, useState } from 'react';
import { useAppStrings } from '../../../../locales/appStrings';
import {
  barStyleInWindow,
  buildWeekTicks,
  formatPlanningDay,
  resolvePlanningBarRange,
  unionPlanningBounds,
} from './planningGanttUtils';
import { kindChipClass, statusBadgeClass, formatPhase1StatusLabel } from '../shared/phase1UiTokens';

const TRACK_PX = 640;
const STORAGE_KEY = 'vh.phase1.ganttExpanded';

/**
 * CSS Gantt for Planning artifacts — collapsed by default (≤ ~28vh when open).
 */
export default function PlanningGanttPanel({
  artifacts = [],
  onSelect,
  kind = '',
  forceExpanded = false,
}) {
  const { t } = useAppStrings();
  const [expanded, setExpanded] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch {
      /* ignore */
    }
    return false;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, expanded ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [expanded]);

  const dated = useMemo(
    () => (Array.isArray(artifacts) ? artifacts : []).filter((a) => resolvePlanningBarRange(a)),
    [artifacts]
  );
  const window = useMemo(() => unionPlanningBounds(dated), [dated]);
  const ticks = useMemo(() => buildWeekTicks(window), [window]);

  if (!dated.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-center text-xs text-muted-foreground">
        {t('workspace.phase1GanttEmpty')}
      </div>
    );
  }

  const open = forceExpanded || expanded;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1.5">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            {t('workspace.phase1GanttTitle')}
            {kind ? <span className={kindChipClass(kind)}>{kind}</span> : null}
          </h2>
          {open ? (
            <p className="text-[10px] text-muted-foreground">
              {formatPlanningDay(window.start)} → {formatPlanningDay(window.end)}
            </p>
          ) : null}
        </div>
        {forceExpanded ? null : (
          <button
            type="button"
            className="shrink-0 rounded border border-border px-2 py-0.5 text-[11px]"
            onClick={() => setExpanded((v) => !v)}
          >
            {open ? t('workspace.phase1GanttCollapse') : t('workspace.phase1GanttExpand')}
          </button>
        )}
      </div>
      {open ? (
        <div className={forceExpanded ? 'max-h-[60vh] overflow-auto' : 'max-h-[28vh] overflow-auto'}>
          <div className="overflow-x-auto">
            <div className="min-w-[720px] p-2">
              <div className="relative mb-1 h-5" style={{ width: TRACK_PX, marginLeft: 140 }}>
                {ticks.map((tick) => {
                  const total = Math.max(
                    1,
                    (window.end.getTime() - window.start.getTime()) / (24 * 60 * 60 * 1000)
                  );
                  const left =
                    ((tick.getTime() - window.start.getTime()) / (24 * 60 * 60 * 1000) / total) *
                    TRACK_PX;
                  return (
                    <span
                      key={tick.toISOString()}
                      className="absolute top-0 text-[10px] text-muted-foreground"
                      style={{ left: `${left}px` }}
                    >
                      {formatPlanningDay(tick).slice(5)}
                    </span>
                  );
                })}
              </div>
              <ul className="space-y-1">
                {dated.map((row) => {
                  const id = String(row.id || row._id);
                  const range = resolvePlanningBarRange(row);
                  const style = barStyleInWindow(range, window, TRACK_PX);
                  const assignee = String(
                    row?.structured?.assigneeUserId || row?.assigneeUserId || ''
                  ).trim();
                  const barLabel = assignee
                    ? `${row.title || ''} · ${assignee.slice(0, 8)}`
                    : row.title;
                  return (
                    <li key={id} className="flex items-center gap-2">
                      <button
                        type="button"
                        className="w-[140px] shrink-0 truncate text-left text-[11px] font-medium hover:underline"
                        title={`${row.externalKey} — ${row.title}${assignee ? ` · ${assignee}` : ''}`}
                        onClick={() => onSelect?.(row)}
                      >
                        <span className={kindChipClass(row.kind)}>{row.kind}</span>{' '}
                        {row.externalKey}
                      </button>
                      <div className="relative h-6 rounded bg-muted/40" style={{ width: TRACK_PX }}>
                        <button
                          type="button"
                          className={`absolute top-0.5 h-5 truncate rounded px-1 text-[10px] font-medium text-primary-foreground ${
                            range.isMilestone ? 'bg-amber-600' : 'bg-primary'
                          }`}
                          style={style}
                          title={`${barLabel} · ${formatPhase1StatusLabel(row.status, t)}`}
                          onClick={() => onSelect?.(row)}
                        >
                          {range.isMilestone ? '◆ ' : ''}
                          {barLabel}
                        </button>
                      </div>
                      <span className={`shrink-0 ${statusBadgeClass(row.status)}`}>
                        {formatPhase1StatusLabel(row.status, t)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
          {dated.length} · {formatPlanningDay(window.start)} → {formatPlanningDay(window.end)}
        </p>
      )}
    </div>
  );
}
