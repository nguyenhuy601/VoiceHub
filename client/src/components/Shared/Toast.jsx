import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_TOAST_ERROR,
  FIGMA_TOAST_INFO,
  FIGMA_TOAST_ROOT,
  FIGMA_TOAST_SUCCESS,
} from './figmaSharedClasses';

/**
 * Thông báo nổi góc màn hình (dùng chung với showToast + useState trong trang).
 */
function Toast({ message, type = 'success', onClose }) {
  const { t } = useAppStrings();
  const isError = type === 'error' || type === 'fail';
  const tone = isError
    ? FIGMA_TOAST_ERROR
    : type === 'info'
      ? FIGMA_TOAST_INFO
      : FIGMA_TOAST_SUCCESS;

  return (
    <div className={`${FIGMA_TOAST_ROOT} ${tone}`} role="status">
      <p className="flex-1 text-sm font-medium">{message}</p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={t('common.close')}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default Toast;
