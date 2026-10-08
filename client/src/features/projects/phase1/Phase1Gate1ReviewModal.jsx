import Modal from '../../../components/Shared/Modal';
import Phase1Gate1ReviewPanel from './aiHitl/Phase1Gate1ReviewPanel';

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  return value || fallback;
}

/** Legacy modal wrapper — body lives in Phase1Gate1ReviewPanel. */
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
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      closable
      size="lg"
      title={labelOf(t, 'requirements.phase1Gate1ModalTitle', 'Gate 1 — BA Analysis Review')}
      footer={null}
    >
      <Phase1Gate1ReviewPanel
        active={open}
        packStatus={packStatus}
        canSubmit={canSubmit}
        canApprove={canApprove}
        summary={summary}
        busy={busy}
        t={t}
        onSubmit={onSubmit}
        onApprove={onApprove}
        onClose={onClose}
        showClose
        showActions
      />
    </Modal>
  );
}
