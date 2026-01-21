const ConfirmDialog = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Xác Nhận", cancelText = "Hủy" }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
      <div className="relative glass-strong rounded-2xl max-w-md w-full animate-scaleIn border border-white/20" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
          <p className="text-gray-300 mb-6">{message}</p>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 glass px-4 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              {cancelText}
            </button>
            <button 
              onClick={() => { onConfirm(); onClose(); }}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all font-semibold text-white"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
