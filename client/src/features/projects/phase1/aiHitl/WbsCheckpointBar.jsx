/**
 * Staged WBS HITL — three distinct CTAs:
 * 1) Lưu chỉnh sửa (save_edit)
 * 2) Xác nhận WBS để chạy tiếp (confirm)
 * 3) Phê duyệt plan → Gate2 (caller navigates / uses confirmPhaseGate2)
 */

import { useCallback, useMemo, useState } from 'react';
import { requirementAPI } from '../../../../services/api/requirementAPI';
import {
  getArtifactStaleMap,
  getCurrentWbsRevisionId,
  getHowRemoteRunId,
  getLatestChangeEvents,
  getPlanManifest,
  getWbsBaselineRevisionId,
  isWaitingWbsConfirm,
} from './wbsCheckpointState';

function labelOf(t, key, fallback) {
  const v = typeof t === 'function' ? t(key) : '';
  return v || fallback;
}

export default function WbsCheckpointBar({
  pack,
  organizationId,
  packId,
  t,
  onRefresh,
  onOpenGate2,
  canConfirmWbs = true,
  canApprovePlan = false,
}) {
  const waiting = isWaitingWbsConfirm(pack);
  const baselineId = getWbsBaselineRevisionId(pack);
  const currentRev = getCurrentWbsRevisionId(pack);
  const runId = getHowRemoteRunId(pack);
  const staleMap = getArtifactStaleMap(pack);
  const events = getLatestChangeEvents(pack, 3);
  const manifest = getPlanManifest(pack);

  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [editNote, setEditNote] = useState('');

  const staleBadges = useMemo(
    () =>
      Object.entries(staleMap).map(([kind, row]) => ({
        kind,
        action: row?.action || 'stale',
      })),
    [staleMap]
  );

  const callResume = useCallback(
    async (action, extra = {}) => {
      if (!organizationId || !packId || !runId) {
        setError('Thiếu pack/run để resume WBS checkpoint');
        return;
      }
      setBusy(action);
      setError('');
      try {
        await requirementAPI.resumeInRunHitl(organizationId, packId, {
          runId,
          kind: 'wbs_confirm',
          phase: 'how',
          resume: {
            action,
            reason: reason || extra.reason || '',
            wbsRevisionId: currentRev,
            baseRevisionId: currentRev,
            requestId: `fe-${action}-${Date.now().toString(36)}`,
            ...extra,
          },
        });
        onRefresh?.();
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            'Không gửi được thao tác WBS checkpoint'
        );
      } finally {
        setBusy(null);
      }
    },
    [organizationId, packId, runId, reason, currentRev, onRefresh]
  );

  if (!waiting && !baselineId && !currentRev && !staleBadges.length && !events.length) {
    return null;
  }

  return (
    <section
      className="rounded-lg border border-amber-200/80 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20 p-3 mb-3 space-y-2"
      data-testid="wbs-checkpoint-bar"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {labelOf(t, 'aiHitl.wbsCheckpoint.title', 'Checkpoint WBS')}
        </h3>
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {baselineId
            ? `Baseline: ${baselineId}`
            : waiting
              ? 'Chờ xác nhận WBS trước Dependency / Schedule'
              : currentRev
                ? `Revision hiện tại: ${currentRev}`
                : null}
        </span>
        {manifest?.planRevisionId ? (
          <span className="text-xs text-slate-500">Plan: {manifest.planRevisionId}</span>
        ) : null}
      </div>

      {staleBadges.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Artifact stale">
          {staleBadges.map((b) => (
            <span
              key={b.kind}
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
            >
              {b.kind}: {b.action}
            </span>
          ))}
        </div>
      ) : null}

      {events.length > 0 ? (
        <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
          {events.map((ev) => (
            <li key={ev.eventId || ev.requestId}>
              {ev.recordedAt ? `${ev.recordedAt} · ` : ''}
              {ev.actor?.userId || 'user'} — {ev.reason || ev.action}
              {ev.baseRevisionId && ev.newRevisionId
                ? ` (${ev.baseRevisionId} → ${ev.newRevisionId})`
                : ''}
            </li>
          ))}
        </ul>
      ) : null}

      <label className="block text-xs text-slate-600 dark:text-slate-300">
        {labelOf(t, 'aiHitl.wbsCheckpoint.reason', 'Lý do chỉnh sửa / xác nhận')}
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          placeholder="VD: Bổ sung SSO theo yêu cầu đã xác nhận"
        />
      </label>

      <label className="block text-xs text-slate-600 dark:text-slate-300">
        {labelOf(t, 'aiHitl.wbsCheckpoint.editNote', 'Ghi chú lưu chỉnh sửa (không chạy lại tool)')}
        <input
          type="text"
          value={editNote}
          onChange={(e) => setEditNote(e.target.value)}
          className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          placeholder="Mô tả field đã sửa trên UI (audit)"
        />
      </label>

      {error ? (
        <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={Boolean(busy) || !canConfirmWbs || !runId}
          onClick={() =>
            callResume('save_edit', {
              reason: reason || editNote,
              changes: editNote
                ? [
                    {
                      entityId: '_ui',
                      field: 'notes',
                      before: '',
                      after: editNote,
                      noSemanticChange: false,
                    },
                  ]
                : [],
            })
          }
          className="vh-motion-btn rounded px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 disabled:opacity-50"
          data-testid="wbs-cta-save-edit"
        >
          {busy === 'save_edit'
            ? '…'
            : labelOf(t, 'aiHitl.wbsCheckpoint.saveEdit', 'Lưu chỉnh sửa')}
        </button>

        <button
          type="button"
          disabled={Boolean(busy) || !canConfirmWbs || !runId || Boolean(baselineId)}
          onClick={() => callResume('confirm')}
          className="vh-motion-btn rounded px-3 py-1.5 text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          data-testid="wbs-cta-confirm"
        >
          {busy === 'confirm'
            ? '…'
            : labelOf(
                t,
                'aiHitl.wbsCheckpoint.confirm',
                'Xác nhận WBS để chạy tiếp'
              )}
        </button>

        <button
          type="button"
          disabled={!canApprovePlan || !manifest}
          onClick={() => onOpenGate2?.()}
          className="vh-motion-btn rounded px-3 py-1.5 text-xs font-medium border border-indigo-300 text-indigo-800 dark:border-indigo-700 dark:text-indigo-200 disabled:opacity-50"
          data-testid="wbs-cta-approve-plan"
          title={
            manifest?.planRevisionId
              ? `Duyệt manifest ${manifest.planRevisionId}`
              : 'Chỉ sau khi HOW sẵn sàng Gate2'
          }
        >
          {labelOf(t, 'aiHitl.wbsCheckpoint.approvePlan', 'Phê duyệt plan (Gate2)')}
        </button>
      </div>
    </section>
  );
}
