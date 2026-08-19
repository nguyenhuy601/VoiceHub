/**
 * Phase 3b — Log work (Actual Hours) on a task/card.
 * Does not change Planned Allocation.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Clock } from 'lucide-react';
import { taskAPI, unwrapTaskApiPayload } from '../../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { isTimeTrackingV1Enabled } from '../../../utils/timeTrackingFlag';

export default function TaskWorklogPanel({
  taskId,
  organizationId = '',
  isDarkMode = false,
  t,
  canEdit = true,
}) {
  const enabled = isTimeTrackingV1Enabled();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState('1');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const inputCls =
    'w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary';

  const load = useCallback(async () => {
    if (!enabled || !taskId) return;
    setLoading(true);
    try {
      const res = await taskAPI.listWorklogs(taskId, { organizationId });
      setSummary(unwrapTaskApiPayload(res));
    } catch (err) {
      const code = err?.response?.data?.errorCode || err?.response?.data?.code || '';
      // When task was removed/moved and the UI still holds a stale cardId,
      // treat TASK_NOT_FOUND as a non-blocking empty state.
      if (code !== 'TASK_NOT_FOUND') {
        toast.error(resolveApiErrorMessage(err, { t, fallback: t('taskBoard.worklogLoadFail') }));
      }
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, taskId, organizationId, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled) return null;

  const items = Array.isArray(summary?.items) ? summary.items : [];

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canEdit || submitting) return;
    setSubmitting(true);
    try {
      await taskAPI.createWorklog(
        taskId,
        { workDate, hours: Number(hours), note },
        { organizationId }
      );
      toast.success(t('taskBoard.worklogSaved'));
      setNote('');
      await load();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('taskBoard.worklogSaveFail') })
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Clock className={`h-4 w-4 ${muted}`} />
        <h4 className="text-sm font-semibold">{t('taskBoard.worklogTitle')}</h4>
      </div>
      <p className={`mb-2 text-[11px] leading-snug ${muted}`}>{t('taskBoard.worklogHint')}</p>
      {loading ? (
        <p className={`text-xs ${muted}`}>{t('common.loading')}</p>
      ) : (
        <p className="mb-2 text-xs">
          {t('taskBoard.worklogTotals', {
            estimate: summary?.estimateHours ?? '—',
            actual: summary?.actualHours ?? 0,
            variance: summary?.varianceHours ?? '—',
          })}
        </p>
      )}
      {canEdit ? (
        <form onSubmit={onSubmit} className="mb-3 grid gap-2 sm:grid-cols-[1fr_80px_auto]">
          <label className={`block text-[11px] ${muted}`}>
            {t('taskBoard.worklogDate')}
            <input
              type="date"
              className={`${inputCls} mt-0.5`}
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              required
            />
          </label>
          <label className={`block text-[11px] ${muted}`}>
            {t('taskBoard.worklogHours')}
            <input
              type="number"
              min={0.25}
              max={24}
              step={0.25}
              className={`${inputCls} mt-0.5`}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="self-end rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {t('taskBoard.worklogAdd')}
          </button>
          <label className={`block text-[11px] sm:col-span-3 ${muted}`}>
            {t('taskBoard.worklogNote')}
            <input
              type="text"
              className={`${inputCls} mt-0.5`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
            />
          </label>
        </form>
      ) : null}
      {items.length ? (
        <ul className={`max-h-32 space-y-1 overflow-y-auto text-[11px] ${muted}`}>
          {items.slice(0, 20).map((row) => (
            <li key={row._id || `${row.workDate}-${row.hours}`}>
              {String(row.workDate || '').slice(0, 10)} · {row.hours}h
              {row.note ? ` — ${row.note}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`text-[11px] ${muted}`}>{t('taskBoard.worklogEmpty')}</p>
      )}
    </div>
  );
}
