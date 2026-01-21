import { useEffect } from 'react';

const Toast = ({ message, type = "success", onClose }) => {
  const colors = {
    success: "from-green-500 to-emerald-500",
    error: "from-red-500 to-orange-500",
    info: "from-blue-500 to-cyan-500",
    warning: "from-yellow-500 to-orange-500"
  };

  const icons = {
    success: "✓",
    error: "✕",
    info: "ℹ",
    warning: "⚠"
  };

  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-6 right-6 glass-strong rounded-xl px-6 py-4 flex items-center gap-3 animate-slideDown z-50 border-l-4 ${colors[type]}`}>
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colors[type]} flex items-center justify-center text-white font-bold`}>
        {icons[type]}
      </div>
      <span className="text-white font-semibold">{message}</span>
      <button onClick={onClose} className="ml-4 text-gray-400 hover:text-white transition-colors">✕</button>
    </div>
  );
};

export default Toast;
