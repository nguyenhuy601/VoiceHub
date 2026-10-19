import { useState } from 'react';
import { isBlockingProposal } from './gate2ReviewOwnership.js';

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  return value || fallback;
}

function statusLabel(t, row) {
  if (row?.riskAcceptance?.notTechApproval) {
    return labelOf(
      t,
      'requirements.gate2RiskAccepted',
      'PO chấp nhận rủi ro — không phải Tech Lead đã duyệt'
    );
  }
  const status = String(row?.status || '');
  if (status === 'accepted') return labelOf(t, 'requirements.gate2ProposalAccepted', 'Đã chấp nhận');
  if (status === 'rejected' && row?.resolution === 'reverted') {
    return labelOf(t, 'requirements.gate2ProposalReverted', 'Giữ nguyên giá trị đã duyệt');
  }
  if (status === 'rejected' && row?.resolution === 'revised') {
    return labelOf(t, 'requirements.gate2ProposalRevised', 'Đã có đề xuất mới');
  }
  if (status === 'rejected') return labelOf(t, 'requirements.gate2ProposalRejected', 'Từ chối — chưa áp dụng');
  if (status === 'escalated') return labelOf(t, 'requirements.gate2ProposalEscalated', 'Chờ PO quyết trade-off');
  if (status === 'pending') return labelOf(t, 'requirements.gate2ProposalPending', 'Chờ chủ phần xác nhận');
  return status || '—';
}

/**
 * PM tổng hợp: đề xuất sửa phần PO/Tech, xử lý từ chối, escalate.
 * Chủ phần accept/reject. PO accept_risk được ghi riêng, không giả Tech Lead đã duyệt.
 */
export default function Gate2ConsolidationPanel({
  mode = 'consolidate',
  assignSections = true,
  proposals = [],
  busy = false,
  t,
  onPropose,
  onDecide,
  onKeepOriginal,
  onEscalate,
  onResolveEscalation,
  onConfirmPlan,
}) {
  const [draft, setDraft] = useState({
    owner: 'tech',
    label: '',
    fromValue: '',
    toValue: '',
    reason: '',
    supersedes: '',
  });
  const blocking = proposals.filter(isBlockingProposal);
  const showForm = mode === 'consolidate';

  const submitDraft = (extra = {}) => {
    if (typeof onPropose !== 'function') return;
    onPropose({ ...draft, ...extra });
    setDraft({ owner: 'tech', label: '', fromValue: '', toValue: '', reason: '', supersedes: '' });
  };

  return (
    <section className="mb-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {labelOf(t, 'requirements.gate2ConsolidationTitle', 'PM tổng hợp')}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {assignSections
            ? labelOf(
                t,
                'requirements.gate2ConsolidationHint',
                'PM kiểm tra xung đột. Sửa phần của Tech Lead hoặc PO chỉ có hiệu lực khi chủ phần xác nhận.'
              )
            : labelOf(
                t,
                'requirements.gate2ConsolidationHintAll',
                'Vai trò tổng hợp xem toàn bộ kế hoạch rồi xác nhận. Không chia section cho từng vai trò.'
              )}
        </p>
      </div>

      {proposals.map((row) => (
        <article key={row.id} className="rounded-md border border-border bg-background p-3 text-xs">
          <p className="font-medium text-foreground">
            {row.label || row.field || row.sectionKey || row.id}
          </p>
          <p className="mt-1 text-muted-foreground">
            {row.fromValue || '—'} → {row.toValue || '—'}
          </p>
          {row.reason ? <p className="mt-1">{row.reason}</p> : null}
          <p className="mt-1 font-medium">{statusLabel(t, row)}</p>
          {row.rejectReason ? (
            <p className="mt-1 text-amber-800 dark:text-amber-200">{row.rejectReason}</p>
          ) : null}

          {mode === 'confirm' && row.status === 'pending' ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide?.({ proposalId: row.id, decision: 'accept' })}
                className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40"
              >
                {labelOf(t, 'requirements.gate2ProposalAccept', 'Chấp nhận')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide?.({ proposalId: row.id, decision: 'reject' })}
                className="rounded-md border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive disabled:opacity-40"
              >
                {labelOf(t, 'requirements.gate2ProposalReject', 'Từ chối')}
              </button>
            </div>
          ) : null}

          {mode === 'confirm' && row.status === 'escalated' ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onResolveEscalation?.({ proposalId: row.id, decision: 'accept_risk' })}
                className="rounded-md border border-amber-600/40 px-2 py-1 text-xs font-semibold text-amber-900 disabled:opacity-40 dark:text-amber-200"
              >
                {labelOf(t, 'requirements.gate2AcceptRisk', 'PO chấp nhận rủi ro')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onResolveEscalation?.({ proposalId: row.id, decision: 'reject' })}
                className="rounded-md border border-border px-2 py-1 text-xs font-semibold disabled:opacity-40"
              >
                {labelOf(t, 'requirements.gate2RejectTradeoff', 'Không chấp nhận trade-off')}
              </button>
            </div>
          ) : null}

          {showForm && row.status === 'rejected' && !row.resolution ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onKeepOriginal?.({ proposalId: row.id })}
                className="rounded-md border border-border px-2 py-1 text-xs font-semibold disabled:opacity-40"
              >
                {labelOf(t, 'requirements.gate2KeepOriginal', 'Giữ nguyên')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setDraft({
                    owner: row.owner || 'tech',
                    label: row.label || '',
                    fromValue: row.fromValue || '',
                    toValue: '',
                    reason: '',
                    supersedes: row.id,
                  })
                }
                className="rounded-md border border-border px-2 py-1 text-xs font-semibold disabled:opacity-40"
              >
                {labelOf(t, 'requirements.gate2ProposeAgain', 'Đề xuất lại')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onEscalate?.({ proposalId: row.id })}
                className="rounded-md border border-amber-600/40 px-2 py-1 text-xs font-semibold text-amber-900 disabled:opacity-40 dark:text-amber-200"
              >
                {labelOf(t, 'requirements.gate2Escalate', 'Chuyển PO quyết trade-off')}
              </button>
            </div>
          ) : null}
        </article>
      ))}

      {showForm && assignSections ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">
            {labelOf(t, 'requirements.gate2ProposalOwner', 'Chủ phần')}
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
              value={draft.owner}
              onChange={(event) => setDraft((prev) => ({ ...prev, owner: event.target.value }))}
            >
              <option value="tech">Tech Lead</option>
              <option value="po">PO</option>
            </select>
          </label>
          <label className="text-xs">
            {labelOf(t, 'requirements.gate2ProposalItem', 'Hạng mục')}
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
              value={draft.label}
              onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
            />
          </label>
          <label className="text-xs">
            {labelOf(t, 'requirements.gate2ProposalFrom', 'Giá trị đã duyệt')}
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
              value={draft.fromValue}
              onChange={(event) => setDraft((prev) => ({ ...prev, fromValue: event.target.value }))}
            />
          </label>
          <label className="text-xs">
            {labelOf(t, 'requirements.gate2ProposalTo', 'Đề xuất')}
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
              value={draft.toValue}
              onChange={(event) => setDraft((prev) => ({ ...prev, toValue: event.target.value }))}
            />
          </label>
          <label className="text-xs sm:col-span-2">
            {labelOf(t, 'requirements.gate2ProposalReason', 'Lý do')}
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
              value={draft.reason}
              onChange={(event) => setDraft((prev) => ({ ...prev, reason: event.target.value }))}
            />
          </label>
          <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => submitDraft()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              {labelOf(t, 'requirements.gate2SendProposal', 'Gửi chủ phần xác nhận')}
            </button>
            <button
              type="button"
              disabled={busy || blocking.length > 0}
              onClick={() => onConfirmPlan?.()}
              className="rounded-md border border-emerald-600/40 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-40 dark:text-emerald-300"
            >
              {labelOf(t, 'requirements.gate2PmConfirmPlan', 'Xác nhận kế hoạch đã nhất quán')}
            </button>
          </div>
        </div>
      ) : null}
      {showForm && !assignSections ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy || blocking.length > 0}
            onClick={() => onConfirmPlan?.()}
            className="rounded-md border border-emerald-600/40 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-40 dark:text-emerald-300"
          >
            {labelOf(t, 'requirements.gate2PmConfirmPlan', 'Xác nhận kế hoạch đã nhất quán')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
