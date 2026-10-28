/**
 * Read-only day breakdown from resource.schedule for one assignment row (Lịch folded into Phân công).
 */

import { scheduleDaysForTask } from './assignmentScheduleTrust.js';

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  return value || fallback;
}

function resolvePackContainer(pack) {
  if (pack?.aiAnalysis && typeof pack.aiAnalysis === 'object') return pack.aiAnalysis;
  return pack && typeof pack === 'object' ? pack : {};
}

function formatDay(dateKey) {
  const match = String(dateKey || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateKey || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * @param {{
 *   row?: object|null,
 *   pack?: object|null,
 *   onClose?: function,
 *   t?: function,
 * }} props
 */
export default function AssignmentScheduleDetailDrawer({ row = null, pack = null, onClose, t }) {
  if (!row) return null;
  const container = resolvePackContainer(pack);
  const taskIds =
    Array.isArray(row.taskIds) && row.taskIds.length
      ? row.taskIds.map(String)
      : [String(row.id || '').trim()].filter(Boolean);
  const days = taskIds.flatMap((taskId) =>
    scheduleDaysForTask(container, taskId).map((d) => ({ ...d, taskId }))
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/40"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && typeof onClose === 'function') onClose();
      }}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-lg"
        role="dialog"
        aria-label={labelOf(t, 'requirements.gate2ScheduleDrawerTitle', 'Chi tiết lịch')}
      >
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {labelOf(t, 'requirements.gate2ScheduleDrawerTitle', 'Chi tiết lịch')}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{row.title || row.id || '—'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            {labelOf(t, 'common.close', 'Đóng')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!days.length ? (
            <p className="text-xs text-muted-foreground">
              {labelOf(
                t,
                'requirements.gate2ScheduleDrawerEmpty',
                'Chưa có dòng resource.schedule cho task này.'
              )}
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">
                    {labelOf(t, 'requirements.gate2ColDate', 'Date')}
                  </th>
                  <th className="py-1.5 pr-2 font-medium">
                    {labelOf(t, 'requirements.gate2ColEffort', 'Effort (h)')}
                  </th>
                  <th className="py-1.5 font-medium">
                    {labelOf(t, 'requirements.gate2ColAssignee', 'Assignee')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={`${day.taskId}:${day.dateKey}:${day.userId}`} className="border-b border-border/60">
                    <td className="py-1.5 pr-2 text-foreground">{formatDay(day.dateKey)}</td>
                    <td className="py-1.5 pr-2 text-foreground">
                      {day.hours != null ? String(day.hours) : '—'}
                    </td>
                    <td className="py-1.5 text-foreground">
                      {day.displayName || day.userId || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>
  );
}
