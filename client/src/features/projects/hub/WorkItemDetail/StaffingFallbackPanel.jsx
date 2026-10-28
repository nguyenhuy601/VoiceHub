/**
 * Staffing fallback — HITL: AI/heuristic gợi ý, PM Confirm override hoặc Fail short-horizon.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { taskAPI } from '../../../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import { useWorkItemDetail } from './WorkItemDetailContext';

export default function StaffingFallbackPanel() {
  const {
    issueId,
    apiCtx,
    isPlanning,
    saving,
    canChangeStatus,
    patchLocalWorkItem,
    title,
    workItem,
    t,
  } = useWorkItemDetail();
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const loadSuggestions = useCallback(async () => {
    if (!issueId || isPlanning) return;
    setBusy(true);
    try {
      const res = await taskAPI.getStaffingFallbackSuggestions(issueId, {
        organizationId: apiCtx?.organizationId,
        limit: 5,
      });
      const data = res?.data?.data || res?.data || {};
      setSuggestions(data);
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          t,
          fallback: t('common.error') || 'Không tải được gợi ý thay người',
        })
      );
    } finally {
      setBusy(false);
    }
  }, [issueId, isPlanning, apiCtx?.organizationId, t]);

  useEffect(() => {
    if (!issueId || isPlanning || !canChangeStatus) return undefined;
    void loadSuggestions();
    return undefined;
  }, [issueId, isPlanning, canChangeStatus, loadSuggestions]);

  const overrideTo = useCallback(
    async (userId) => {
      if (!issueId || !userId) return;
      setBusy(true);
      try {
        await taskAPI.applyStaffingFallbackOverride(
          issueId,
          { toUserId: userId, reason: 'pm_override_ui' },
          { organizationId: apiCtx?.organizationId }
        );
        patchLocalWorkItem?.({ assigneeId: userId });
        toast.success(t('common.saved') || 'Đã override phân công');
        setSuggestions(null);
        void loadSuggestions();
      } catch (err) {
        toast.error(
          resolveApiErrorMessage(err, {
            t,
            fallback: 'Override thất bại',
          })
        );
      } finally {
        setBusy(false);
      }
    },
    [issueId, apiCtx?.organizationId, patchLocalWorkItem, t, loadSuggestions]
  );

  const failShort = useCallback(async () => {
    if (!issueId) return;
    setBusy(true);
    try {
      await taskAPI.failStaffingShortHorizon(
        issueId,
        { reason: 'pm_fail_short_horizon_ui' },
        { organizationId: apiCtx?.organizationId }
      );
      patchLocalWorkItem?.({ status: 'cancelled' });
      toast.success('Đã đánh dấu fail short-horizon (PM xác nhận)');
      setSuggestions(null);
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          t,
          fallback: 'Fail short-horizon thất bại',
        })
      );
    } finally {
      setBusy(false);
    }
  }, [issueId, apiCtx?.organizationId, patchLocalWorkItem, t]);

  if (isPlanning || !canChangeStatus) return null;

  const kind = suggestions?.kind;
  const candidates = Array.isArray(suggestions?.candidates) ? suggestions.candidates : [];
  const tags = Array.isArray(suggestions?.taskTags)
    ? suggestions.taskTags
    : Array.isArray(workItem?.tags)
      ? workItem.tags
      : [];

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Staffing fallback
        </p>
        <button
          type="button"
          disabled={busy || saving}
          onClick={() => void loadSuggestions()}
          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
        >
          Làm mới gợi ý
        </button>
        {kind === 'fail_short_horizon' ? (
          <button
            type="button"
            disabled={busy || saving}
            onClick={() => void failShort()}
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-800 dark:text-rose-200 disabled:opacity-50"
          >
            Fail &lt; 1 ngày (PM)
          </button>
        ) : null}
      </div>
      {kind ? (
        <p className="text-[11px] text-muted-foreground">
          Nhánh: <span className="font-semibold text-foreground">{kind}</span>
          {suggestions?.remainingCalendarDays != null
            ? ` · còn ${suggestions.remainingCalendarDays} ngày`
            : ''}
          {kind === 'suggest_replace'
            ? ' · AI gợi ý, PM xác nhận (không tự gán)'
            : null}
          {kind === 'fail_short_horizon'
            ? ' · Quỹ thời gian ngắn — PM xác nhận fail, không gán người mới'
            : null}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {busy ? 'Đang tải gợi ý…' : 'Chưa có nhánh fallback (task done hoặc thiếu due date).'}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground leading-snug">
        Onboard nhanh: title
        {title ? ` “${String(title).slice(0, 80)}”` : ''}
        {tags.length ? ` · tags ${tags.slice(0, 6).join(', ')}` : ''}
        {' · worklog/activity trên work item.'}
      </p>
      {candidates.length ? (
        <ul className="flex flex-col gap-1">
          {candidates.map((c) => (
            <li key={c.userId} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-foreground/80">
                {c.displayName || c.userId}
                {typeof c.score === 'number' ? (
                  <span className="ml-1 text-muted-foreground">· score {c.score}</span>
                ) : null}
              </span>
              <button
                type="button"
                disabled={busy || saving || kind === 'fail_short_horizon'}
                onClick={() => void overrideTo(c.userId)}
                className="shrink-0 rounded border border-border px-2 py-0.5 font-semibold hover:bg-muted disabled:opacity-50"
              >
                Confirm
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
