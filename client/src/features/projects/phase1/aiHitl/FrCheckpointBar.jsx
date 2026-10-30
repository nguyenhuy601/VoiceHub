/**
 * Staged FR HITL (WHAT, always-on) — CTAs:
 * 1) Lưu chỉnh sửa (save_edit)
 * 2) Xác nhận FR để chạy tiếp UC/Data (confirm)
 * Gate 1 approve stays on Review tab — not on this bar.
 */

import { useCallback, useState } from 'react';
import { requirementAPI } from '../../../../services/api/requirementAPI';
import {
  getCurrentFrRevisionId,
  getFrBaselineRevisionId,
  getLatestFrChangeEvents,
  getWhatRemoteRunId,
  isWaitingFrConfirm,
} from './frCheckpointState';

function labelOf(t, key, fallback) {
  const v = typeof t === 'function' ? t(key) : '';
  return v || fallback;
}

export default function FrCheckpointBar({
  pack,
  organizationId,
  packId,
  t,
  onRefresh,
  canConfirmFr = true,
}) {
  const waiting = isWaitingFrConfirm(pack);
  const baselineId = getFrBaselineRevisionId(pack);
  const currentRev = getCurrentFrRevisionId(pack);
  const runId = getWhatRemoteRunId(pack);
  const events = getLatestFrChangeEvents(pack, 3);

  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [editNote, setEditNote] = useState('');

  const callResume = useCallback(
    async (action, extra = {}) => {
      if (!organizationId || !packId || !runId) {
        setError('Thiếu pack/run để resume FR checkpoint');
        return;
      }
      setBusy(action);
      setError('');
      try {
        await requirementAPI.resumeInRunHitl(organizationId, packId, {
          runId,
          kind: 'fr_confirm',
          phase: 'what',
          resume: {
            action,
            reason: reason || extra.reason || '',
            frRevisionId: currentRev,
            baseRevisionId: currentRev,
            requestId: `fe-fr-${action}-${Date.now().toString(36)}`,
            ...extra,
          },
        });
        onRefresh?.();
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            'Không gửi được thao tác FR checkpoint'
        );
      } finally {
        setBusy(null);
      }
    },
    [organizationId, packId, runId, reason, currentRev, onRefresh]
  );

  if (!waiting && !baselineId && !currentRev && !events.length) {
    return null;
  }

  return (
    <section
      className="rounded-lg border border-sky-200/80 bg-sky-50/60 dark:border-sky-900/50 dark:bg-sky-950/20 p-3 mb-3 space-y-2"
      data-testid="fr-checkpoint-bar"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {labelOf(t, 'aiHitl.frCheckpoint.title', 'Checkpoint FR')}
        </h3>
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {baselineId
            ? `Baseline: ${baselineId}`
            : waiting
              ? 'Chờ xác nhận FR trước UC / Data'
              : currentRev
                ? `Revision hiện tại: ${currentRev}`
                : null}
        </span>
      </div>

      {events.length > 0 ? (
        <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
          {events.map((ev) => (
            <li key={ev.eventId || ev.requestId}>
              {ev.recordedAt ? `${ev.recordedAt} · ` : ''}
              {ev.actor?.userId || 'user'} — {ev.reason || ev.action}
            </li>
          ))}
        </ul>
      ) : null}

      <label className="block text-xs text-slate-600 dark:text-slate-300">
        {labelOf(t, 'aiHitl.frCheckpoint.reason', 'Lý do chỉnh sửa / xác nhận')}
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          placeholder="VD: Bổ sung AC cho FR-01"
        />
      </label>

      <label className="block text-xs text-slate-600 dark:text-slate-300">
        {labelOf(t, 'aiHitl.frCheckpoint.editNote', 'Ghi chú lưu chỉnh sửa (không chạy lại tool)')}
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
          disabled={Boolean(busy) || !canConfirmFr || !runId}
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
          data-testid="fr-cta-save-edit"
        >
          {busy === 'save_edit'
            ? '…'
            : labelOf(t, 'aiHitl.frCheckpoint.saveEdit', 'Lưu chỉnh sửa')}
        </button>

        <button
          type="button"
          disabled={Boolean(busy) || !canConfirmFr || !runId || Boolean(baselineId)}
          onClick={() => callResume('confirm')}
          className="vh-motion-btn rounded px-3 py-1.5 text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
          data-testid="fr-cta-confirm"
        >
          {busy === 'confirm'
            ? '…'
            : labelOf(
                t,
                'aiHitl.frCheckpoint.confirm',
                'Xác nhận FR để chạy tiếp UC/Data'
              )}
        </button>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {labelOf(
          t,
          'aiHitl.frCheckpoint.notGate1',
          'Checkpoint FR không phải Gate 1 — duyệt SRS vẫn ở tab Duyệt.'
        )}
      </p>
    </section>
  );
}
