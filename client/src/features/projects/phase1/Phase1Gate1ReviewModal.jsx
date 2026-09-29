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
      size="lg"
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
              count: Array.isArray(summary.reviewItems)
                ? summary.reviewItems.length
                : summary.g4RequirementCount || 0,
            })}
          </li>
          <li>
            {labelOf(t, 'requirements.phase1Citations', '{count} citations', {
              count: summary.citationCount || 0,
            })}
          </li>
        </ul>
      ) : null}
      {Array.isArray(summary?.reviewItems) && summary.reviewItems.length ? (
        <div className="mt-3 max-h-80 overflow-auto rounded-md border border-border">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">
                  {labelOf(t, 'requirements.phase1ColFr', 'FR')}
                </th>
                <th className="px-2 py-1.5 font-medium">
                  {labelOf(t, 'requirements.phase1ColTitle', 'Tiêu đề')}
                </th>
                <th className="px-2 py-1.5 font-medium">
                  {labelOf(t, 'requirements.phase1ColDescription', 'Mô tả')}
                </th>
                <th className="px-2 py-1.5 font-medium">AC</th>
              </tr>
            </thead>
            <tbody>
              {summary.reviewItems.map((row, index) => (
                <tr key={`${row.id || 'row'}-${index}`} className="border-t border-border align-top">
                  <td className="px-2 py-1.5 font-medium text-foreground">{row.id}</td>
                  <td className="px-2 py-1.5 text-foreground">{row.title}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.description}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.ac}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : summary?.done ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {labelOf(
            t,
            'requirements.phase1Gate1EmptyReview',
            'Chưa có requirement đã xử lý để review.'
          )}
        </p>
      ) : null}
    </Modal>
  );
}
