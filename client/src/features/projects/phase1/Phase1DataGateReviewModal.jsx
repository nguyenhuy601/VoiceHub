import Modal from '../../../components/Shared/Modal';
import Phase1DataGateReviewPanel from './aiHitl/Phase1DataGateReviewPanel';

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value) return value;
  if (!vars) return fallback;
  return Object.entries(vars).reduce(
    (text, [name, raw]) => text.replace(`{${name}}`, String(raw ?? '')),
    fallback
  );
}

/** Legacy modal wrapper — body lives in Phase1DataGateReviewPanel. */
export default function Phase1DataGateReviewModal({
  open,
  preview,
  busy = false,
  t,
  onLoadPage,
  onPass,
  onReject,
}) {
  return (
    <Modal
      isOpen={open}
      onClose={() => {}}
      closable={false}
      size="lg"
      title={labelOf(t, 'requirements.phase1DataGateTitle', 'Review dữ liệu sau bước 2')}
      footer={null}
    >
      <Phase1DataGateReviewPanel
        active={open}
        preview={preview}
        busy={busy}
        t={t}
        onLoadPage={onLoadPage}
        onPass={onPass}
        onReject={onReject}
        showActions
      />
    </Modal>
  );
}
