import { createPortal } from 'react-dom';

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  /** z cao hơn menu ngữ cảnh / portal (vd. danh sách thành viên ~9998) */
  layerClassName = 'z-[10050]',
}) => {
  if (!isOpen || typeof document === 'undefined') return null;

  const handleConfirm = () => {
    const ret = onConfirm?.();
    Promise.resolve(ret).finally(() => {
      onClose();
    });
  };

  return createPortal(
    <div
      className={`fixed inset-0 ${layerClassName} flex items-center justify-center p-4 animate-fadeIn`}
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden />
      <div
        className="relative glass-strong rounded-2xl max-w-md w-full animate-scaleIn border border-amber-500/35 shadow-2xl shadow-amber-900/20"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="p-6">
          <h3 id="confirm-dialog-title" className="text-xl font-bold text-white mb-3">
            {title}
          </h3>
          <p className="text-gray-300 mb-6">{message}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 glass px-4 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold text-gray-100 border border-white/10"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 bg-gradient-to-r from-amber-600 to-yellow-600 px-4 py-3 rounded-xl hover:from-amber-500 hover:to-yellow-500 transition-all font-semibold text-[#0f1218] shadow-md shadow-amber-900/30"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;
