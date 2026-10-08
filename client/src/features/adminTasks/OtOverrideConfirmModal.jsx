import { createPortal } from 'react-dom';
import { useId, useRef, useState } from 'react';
import useModalA11y from '../../components/Shared/useModalA11y';
import { useAppStrings } from '../../locales/appStrings';

const RATIONALE_MAX_LENGTH = 500;

/**
 * Soft OT override — PM nhập rationale bắt buộc trước khi gán vượt maxConcurrentProjects.
 */
export default function OtOverrideConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  currentActiveProjects = null,
  maxConfigured = null,
  title,
  confirmText,
  cancelText,
  rationaleLabel,
  rationalePlaceholder,
  rationaleRequiredText,
  message = null,
  busy = false,
}) {
  const { t } = useAppStrings();
  const [rationale, setRationale] = useState('');
  const [localError, setLocalError] = useState('');
  const dialogRef = useRef(null);
  const textareaRef = useRef(null);
  const titleId = useId();
  const messageId = useId();
  const rationaleId = useId();
  const errorId = useId();

  const handleClose = () => {
    if (busy) return;
    setRationale('');
    setLocalError('');
    onClose?.();
  };

  useModalA11y({
    isOpen,
    onClose: handleClose,
    containerRef: dialogRef,
    initialFocusRef: textareaRef,
    isBusy: busy,
  });

  if (!isOpen || typeof document === 'undefined') return null;

  const handleConfirm = () => {
    const text = String(rationale || '').trim();
    if (!text) {
      setLocalError(rationaleRequiredText ?? t('adminTasks.otOverrideNeedReason'));
      return;
    }
    const ret = onConfirm?.(text);
    Promise.resolve(ret).finally(() => {
      setRationale('');
      setLocalError('');
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10100] flex items-center justify-center p-4 animate-fadeIn"
      onClick={handleClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-2xl border border-warning bg-card shadow-2xl animate-scaleIn motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        aria-busy={busy || undefined}
      >
        <div className="p-6">
          <h3 id={titleId} className="mb-2 text-xl font-bold text-warning">
            {title ?? t('adminTasks.otOverrideTitle')}
          </h3>
          <p id={messageId} className="mb-3 text-sm leading-relaxed text-muted-foreground">
            {message != null
              ? message
              : t('adminTasks.otOverrideMessage', {
                  current: currentActiveProjects ?? '—',
                  max: maxConfigured ?? '—',
                })}
          </p>
          <label htmlFor={rationaleId} className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {rationaleLabel ?? t('adminTasks.otOverrideRationale')}
          </label>
          <textarea
            ref={textareaRef}
            id={rationaleId}
            rows={3}
            maxLength={RATIONALE_MAX_LENGTH}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 focus:ring-2 focus:ring-ring motion-reduce:transition-none"
            value={rationale}
            disabled={busy}
            aria-invalid={localError ? true : undefined}
            aria-describedby={localError ? errorId : undefined}
            onChange={(e) => {
              setRationale(e.target.value);
              if (localError) setLocalError('');
            }}
            placeholder={rationalePlaceholder ?? t('adminTasks.otOverridePlaceholder')}
          />
          {localError ? (
            <p id={errorId} className="mt-1.5 text-xs text-destructive" role="alert">
              {localError}
            </p>
          ) : null}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="flex-1 rounded-xl border border-border bg-background px-4 py-3 font-semibold text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
            >
              {cancelText ?? t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="flex-1 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-sm transition duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              {busy ? t('common.saving') : confirmText ?? t('adminTasks.otOverrideConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
