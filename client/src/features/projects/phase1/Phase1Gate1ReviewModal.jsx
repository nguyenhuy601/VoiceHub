import Modal from '../../../components/Shared/Modal';

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value) return value;
  if (!vars) return fallback;
  return Object.entries(vars).reduce(
    (text, [name, raw]) => text.replace(`{${name}}`, String(raw ?? '')),
    fallback
  );
}

export default function Phase1Gate1ReviewModal({
  open,
  packStatus = '',
  canSubmit = false,
  canApprove = false,
  summary = null,
  busy = false,
  t,
  onClose,
  onSubmit,
  onApprove,
}) {
  const underReview = packStatus === 'under_review';
  const showApprove = underReview && canApprove;
  const showSubmit = !underReview && canSubmit;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      closable
      size="md"
      title={labelOf(t, 'requirements.phase1Gate1ModalTitle', 'Gate 1 — Human Review')}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50"
          >
            {labelOf(t, 'common.close', 'Đóng')}
          </button>
          {showSubmit ? (
            <button
              type="button"
              disabled={busy}
              onClick={onSubmit}
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {labelOf(t, 'requirements.understandingGate1Cta', 'Gửi duyệt Gate 1')}
            </button>
          ) : null}
          {showApprove ? (
            <button
              type="button"
              disabled={busy}
              onClick={onApprove}
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {labelOf(t, 'requirements.phase1ApproveCta', 'Duyệt Gate 1')}
            </button>
          ) : null}
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        {underReview && !canApprove
          ? labelOf(
              t,
              'requirements.phase1Gate1WaitingPo',
              'Đã gửi duyệt. Chờ PO duyệt để sang Phase 2.'
            )
          : labelOf(
              t,
              'requirements.phase1Gate1ModalHint',
              'Pass theo đúng vai: BA gửi duyệt, PO duyệt pack.'
            )}
      </p>
      {summary?.done ? (
        <ul className="mt-3 space-y-1 text-sm text-foreground">
          <li>
            {labelOf(t, 'requirements.phase1Seeded', 'Đã seed {count} artifacts', {
              count: summary.g4RequirementCount || 0,
            })}
          </li>
          <li>
            {labelOf(t, 'requirements.phase1Citations', '{count} citations', {
              count: summary.citationCount || 0,
            })}
          </li>
        </ul>
      ) : null}
    </Modal>
  );
}
