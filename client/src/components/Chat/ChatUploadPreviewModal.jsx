import { FileText } from 'lucide-react';
import Modal from '../Shared/Modal';
import { useAppStrings } from '../../locales/appStrings';

const MOTION_BTN =
  'motion-safe:transition-colors motion-reduce:transition-none';

/**
 * Xác nhận gửi file/ảnh trước khi upload (DM / org).
 * Dùng Shared Modal (Esc + focus trap).
 */
export default function ChatUploadPreviewModal({
  open,
  file,
  previewUrl,
  /** @deprecated Theme tokens tự thích ứng; giữ prop để tương thích caller cũ. */
  isDarkMode: _isDarkMode,
  onCancel,
  onConfirm,
  confirmLabel,
  cancelLabel,
  title,
}) {
  const { t } = useAppStrings();
  const confirmText = confirmLabel || t('chat.uploadPreview.confirm');
  const cancelText = cancelLabel || t('chat.uploadPreview.cancel');
  const titleText = title || t('chat.uploadPreview.title');

  const footer = (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className={`rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${MOTION_BTN}`}
      >
        {cancelText}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className={`rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${MOTION_BTN}`}
      >
        {confirmText}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={Boolean(open && file)}
      onClose={onCancel}
      title={titleText}
      size="sm"
      footer={footer}
      bodyClassName="space-y-3"
    >
      {file ? (
        <div className="max-h-[50vh] overflow-auto rounded-xl border border-border bg-muted/40 p-2">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={file.name}
              className="mx-auto max-h-[40vh] max-w-full rounded-lg object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <FileText className="h-10 w-10" strokeWidth={1.75} aria-hidden />
              <p className="max-w-full truncate px-2 text-center text-sm font-medium text-foreground">
                {file.name}
              </p>
              <p className="text-xs">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
