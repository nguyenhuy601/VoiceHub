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

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  layerClassName = 'z-[200]',
  closable = true,
  fill = false,
  footer = null,
  bodyClassName = '',
  panelClassName = '',
}) => {
  const { t } = useAppStrings();
  if (!isOpen) return null;

  const sizeClass = fill
    ? FIGMA_MODAL_SIZES.full
    : FIGMA_MODAL_SIZES[size] || FIGMA_MODAL_SIZES.md;
  const panelClass = fill
    ? `${FIGMA_MODAL_PANEL} ${sizeClass} h-[95vh] max-h-[95vh] ${panelClassName}`.trim()
    : `${FIGMA_MODAL_PANEL} ${sizeClass} ${panelClassName}`.trim();
  const bodyClass = fill
    ? `flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 ${bodyClassName}`.trim()
    : `${FIGMA_MODAL_BODY} ${bodyClassName}`.trim();
  const overlayClass = fill
    ? `${FIGMA_MODAL_OVERLAY} p-2 sm:p-3 ${layerClassName}`.trim()
    : `${FIGMA_MODAL_OVERLAY} ${layerClassName}`.trim();

  return (
    <div
      className={overlayClass}
      onClick={closable ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className={FIGMA_MODAL_BACKDROP} aria-hidden />
      <div className={panelClass} onClick={(e) => e.stopPropagation()}>
        <div className={FIGMA_MODAL_HEADER}>
          <h2 className={FIGMA_MODAL_TITLE}>{title}</h2>
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
            <span className="h-8 w-8" aria-hidden />
          )}
        </div>
        <div className={bodyClass}>{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-border px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
};

export default Modal;
