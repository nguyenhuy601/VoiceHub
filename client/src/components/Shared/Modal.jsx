import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_MODAL_BACKDROP,
  FIGMA_MODAL_BODY,
  FIGMA_MODAL_CLOSE_BTN,
  FIGMA_MODAL_HEADER,
  FIGMA_MODAL_OVERLAY,
  FIGMA_MODAL_PANEL,
  FIGMA_MODAL_SIZES,
  FIGMA_MODAL_TITLE,
} from './figmaSharedClasses';

const DEFAULT_MODAL_Z = 10050;

/**
 * Merge overlay tokens with optional layerClassName.
 * Legacy low z-* overrides (e.g. z-[250]) are ignored so shell nav (z-1200) stays below.
 * High overrides (Profile z-[99999]) replace the default z.
 */
function resolveOverlayClass(layerClassName = '') {
  const extra = String(layerClassName || '').trim();
  const zMatch = extra.match(/\bz-\[(\d+)\]/);
  if (!zMatch) {
    return `${FIGMA_MODAL_OVERLAY} ${extra}`.trim();
  }
  const z = Number(zMatch[1]);
  if (Number.isFinite(z) && z >= DEFAULT_MODAL_Z) {
    const base = FIGMA_MODAL_OVERLAY.replace(/\bz-\[\d+\]/, '').trim();
    return `${base} ${extra}`.trim();
  }
  const withoutZ = extra.replace(/\bz-\[\d+\]/g, '').trim();
  return `${FIGMA_MODAL_OVERLAY} ${withoutZ}`.trim();
}

/**
 * Shared modal — portal to document.body so shell nav (z-1200) / page siblings
 * cannot paint over the overlay (stacking context of ThreeFrameLayout center).
 */
const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  /** Optional classes; z-* ≥ 10050 overrides default overlay z. */
  layerClassName = '',
  closable = true,
  fill = false,
  footer = null,
  bodyClassName = '',
  panelClassName = '',
  headerClassName = '',
  titleClassName = '',
}) => {
  const { t } = useAppStrings();

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const sizeClass = fill
    ? FIGMA_MODAL_SIZES.full
    : FIGMA_MODAL_SIZES[size] || FIGMA_MODAL_SIZES.md;
  const panelClass = fill
    ? `${FIGMA_MODAL_PANEL} ${sizeClass} h-[min(95dvh,95vh)] max-h-[min(95dvh,95vh)] ${panelClassName}`.trim()
    : `${FIGMA_MODAL_PANEL} ${sizeClass} ${panelClassName}`.trim();
  const bodyClass = fill
    ? `flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2.5 sm:px-4 sm:py-3 ${bodyClassName}`.trim()
    : `${FIGMA_MODAL_BODY} ${bodyClassName}`.trim();
  const overlayClass = resolveOverlayClass(layerClassName);
  const headerClass = `${FIGMA_MODAL_HEADER} ${headerClassName}`.trim();
  const titleClass = `${FIGMA_MODAL_TITLE} ${titleClassName}`.trim();

  const tree = (
    <div
      className={overlayClass}
      onClick={closable ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className={FIGMA_MODAL_BACKDROP} aria-hidden />
      <div className={panelClass} onClick={(e) => e.stopPropagation()}>
        <div className={headerClass}>
          <h2 className={titleClass}>{title}</h2>
          {closable ? (
            <button
              type="button"
              onClick={onClose}
              className={FIGMA_MODAL_CLOSE_BTN}
              aria-label={t('common.close')}
            >
              ✕
            </button>
          ) : (
            <span className="h-8 w-8 shrink-0" aria-hidden />
          )}
        </div>
        <div className={bodyClass}>{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-border px-3 py-2.5 sm:px-4 sm:py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(tree, document.body);
};

export default Modal;
