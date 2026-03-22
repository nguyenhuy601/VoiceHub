const Modal = ({ isOpen, onClose, title, children, size = "md" }) => {
  if (!isOpen) return null;
  
  const sizes = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-4xl",
    xl: "max-w-6xl",
    full: "max-w-[95vw]"
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
      <div 
        className={`relative glass-strong rounded-2xl ${sizes[size]} w-full max-h-[90vh] overflow-hidden animate-scaleIn border border-white/20`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-2xl font-bold text-gradient">{title}</h2>
          <button 
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center text-2xl text-white/90 hover:text-white"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] scrollbar-gradient">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
