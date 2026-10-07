import { Loader2 } from 'lucide-react';
import { intakeUi } from './intakeUi';

const PHASE_MESSAGE_KEYS = {
  creating_project: 'adminTasks.intakeSubmitCreatingProject',
  creating_pack: 'adminTasks.intakeSubmitCreatingPack',
  uploading: 'adminTasks.intakeSubmitUploading',
  opening_workspace: 'adminTasks.intakeSubmitOpeningProject',
};

const PHASE_FALLBACKS = {
  creating_project: 'Đang tạo dự án nháp…',
  creating_pack: 'Đang tạo requirement pack…',
  uploading: 'Đang tải Customer Requirement…',
  opening_workspace: 'Đang mở workspace dự án…',
};

export default function IntakeSubmitOverlay({ phase, t }) {
  if (!phase || phase === 'idle') return null;

  const key = PHASE_MESSAGE_KEYS[phase];
  const message = (key && t(key)) || PHASE_FALLBACKS[phase] || t('common.loading');
  const subMessage =
    t('adminTasks.intakeSubmitPleaseWait') ||
    t('common.pleaseWaitMoment') ||
    'Vui lòng không đóng trang.';

  return (
    <div
      className={intakeUi.submitOverlay}
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-label={message}
    >
      <div className={intakeUi.submitOverlayCard}>
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden />
        <p className="mt-4 text-center text-base font-semibold text-foreground">{message}</p>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">{subMessage}</p>
      </div>
    </div>
  );
}
