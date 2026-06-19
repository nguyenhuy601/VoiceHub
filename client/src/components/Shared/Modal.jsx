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

const Modal = ({ isOpen, onClose, title, children, size = 'md', layerClassName = 'z-[200]' }) => {
  const { t } = useAppStrings();
  if (!isOpen) return null;

  return (
    <div
      className={`${FIGMA_MODAL_OVERLAY} ${layerClassName}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={FIGMA_MODAL_BACKDROP} aria-hidden />
      <div
        className={`${FIGMA_MODAL_PANEL} ${FIGMA_MODAL_SIZES[size] || FIGMA_MODAL_SIZES.md}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={FIGMA_MODAL_HEADER}>
          <h2 className={FIGMA_MODAL_TITLE}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className={FIGMA_MODAL_CLOSE_BTN}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
        <div className={FIGMA_MODAL_BODY}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
