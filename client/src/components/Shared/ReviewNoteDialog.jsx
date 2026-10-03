import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_MODAL_BACKDROP,
  FIGMA_MODAL_CLOSE_BTN,
  FIGMA_MODAL_HEADER,
  FIGMA_MODAL_OVERLAY,
  FIGMA_MODAL_PANEL,
  FIGMA_MODAL_TITLE,
} from './figmaSharedClasses';

/**
 * Professional note dialog for Phase 1 review (request changes / reject).
 * Replaces native window.prompt.
 *
 * @param {'request_changes'|'reject'|'generic'} [variant]
 */
export default function ReviewNoteDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  description,
  placeholder,
  submitLabel,
  variant = 'generic',
  maxLength = 1000,
  layerClassName = 'z-[220]',
}) {
  const { t } = useAppStrings();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;
    setNote('');
    setError('');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tmr = window.setTimeout(() => textareaRef.current?.focus(), 40);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(tmr);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const trimmed = String(note || '').trim();
  const canSubmit = trimmed.length > 0;

  const accentBar =
    variant === 'reject'
      ? 'bg-destructive'
      : variant === 'request_changes'
        ? 'bg-amber-500'
        : 'bg-primary';

  const submitTone =
    variant === 'reject'
      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
      : variant === 'request_changes'
        ? 'bg-amber-600 text-[#0f1218] hover:bg-amber-500'
        : 'bg-primary text-primary-foreground hover:bg-primary/90';

  const handleSubmit = () => {
    if (!canSubmit) {
      setError(t('workspace.phase1ReviewNoteRequiredInline'));
      textareaRef.current?.focus();
      return;
    }
    onSubmit?.(trimmed.slice(0, maxLength));
    onClose?.();
  };

  return createPortal(
    <div
      className={`${FIGMA_MODAL_OVERLAY} ${layerClassName}`.trim()}
      onClick={onClose}
      role="presentation"
    >
      <div className={FIGMA_MODAL_BACKDROP} aria-hidden />
      <div
        className={`${FIGMA_MODAL_PANEL} max-w-lg overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className={`h-1 w-full shrink-0 ${accentBar}`} aria-hidden />
        <div className={FIGMA_MODAL_HEADER}>
          <h2 id={titleId} className={FIGMA_MODAL_TITLE}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={FIGMA_MODAL_CLOSE_BTN}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-3 px-6 py-4">
          {description ? (
            <p id={descId} className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : (
            <span id={descId} className="sr-only">
              {title}
            </span>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">
              {t('workspace.phase1ReviewNoteLabel')}
              <span className="text-destructive"> *</span>
            </span>
            <textarea
              ref={textareaRef}
              className={`min-h-[8rem] w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 ${
                error
                  ? 'border-destructive focus:border-destructive focus:ring-destructive/25'
                  : 'border-border focus:border-primary focus:ring-primary/25'
              }`}
              value={note}
              maxLength={maxLength}
              placeholder={placeholder}
              aria-invalid={Boolean(error)}
              aria-errormessage={error ? errorId : undefined}
              onChange={(e) => {
                setNote(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </label>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span id={errorId}>
              {error ? (
                <span className="text-destructive">{error}</span>
              ) : (
                t('workspace.phase1ReviewNoteHint')
              )}
            </span>
            <span className="font-mono tabular-nums">
              {trimmed.length}/{maxLength}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3">
          <button
            type="button"
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-50 ${submitTone}`}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitLabel || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
