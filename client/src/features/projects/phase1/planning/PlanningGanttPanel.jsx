import { useEffect, useMemo, useState } from 'react';
import { useAppStrings } from '../../../../locales/appStrings';
import {
  barStyleInWindow,
  buildWeekTicks,
  formatPlanningDay,
  resolvePlanningBarRange,
  unionPlanningBounds,
} from './planningGanttUtils';

const TRACK_PX = 640;
const STORAGE_KEY = 'vh.phase1.ganttExpanded';

/**
 * CSS Gantt for Planning artifacts — collapsed by default (≤ ~28vh when open).
 */
export default function PlanningGanttPanel({ artifacts = [], onSelect, kind = '' }) {
  const { t } = useAppStrings();
  const defaultExpanded = String(kind).toUpperCase() === 'SCHEDULE';
  const [expanded, setExpanded] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch {
      /* ignore */
    }
    return defaultExpanded;
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

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold">{t('workspace.phase1GanttTitle')}</h2>
          {expanded ? (
            <p className="text-[10px] text-muted-foreground">
              {formatPlanningDay(window.start)} → {formatPlanningDay(window.end)}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="shrink-0 rounded border border-border px-2 py-0.5 text-[11px]"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t('workspace.phase1GanttCollapse') : t('workspace.phase1GanttExpand')}
        </button>
      </div>
      {expanded ? (
        <div className="max-h-[28vh] overflow-auto">
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
                  return (
                    <li key={id} className="flex items-center gap-2">
                      <button
                        type="button"
                        className="w-[140px] shrink-0 truncate text-left text-[11px] font-medium hover:underline"
                        title={`${row.externalKey} — ${row.title}`}
                        onClick={() => onSelect?.(row)}
                      >
                        <span className="font-mono text-[10px] text-muted-foreground">{row.kind}</span>{' '}
                        {row.externalKey}
                      </button>
                      <div className="relative h-6 rounded bg-muted/40" style={{ width: TRACK_PX }}>
                        <button
                          type="button"
                          className={`absolute top-0.5 h-5 truncate rounded px-1 text-[10px] font-medium text-primary-foreground ${
                            range.isMilestone ? 'bg-amber-600' : 'bg-primary'
                          }`}
                          style={style}
                          title={row.title}
                          onClick={() => onSelect?.(row)}
                        >
                          {range.isMilestone ? '◆' : ''} {row.title}
                        </button>
                      </div>
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
