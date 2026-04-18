import { useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';

const Toast = ({ message, type = 'success', onClose }) => {
  const { isDarkMode } = useTheme();
  const colors = {
    success: 'from-green-500 to-emerald-500',
    error: 'from-red-500 to-orange-500',
    fail: 'from-red-500 to-orange-500',
    info: 'from-blue-500 to-cyan-500',
    warning: 'from-yellow-500 to-orange-500',
  };

  const icons = {
    success: '✓',
    error: '✕',
    fail: '✕',
    info: 'ℹ',
    warning: '⚠',
  };

  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const shell = isDarkMode
    ? 'glass-strong border-l-4'
    : 'border border-slate-200 bg-white shadow-lg border-l-4';

  return (
    <div
      className={`fixed right-6 top-6 z-[300] flex animate-slideDown items-center gap-3 rounded-xl px-6 py-4 ${shell} ${colors[type]}`}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${colors[type]} font-bold text-white`}
      >
        {icons[type]}
      </div>
      <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{message}</span>
      <button
        type="button"
        onClick={onClose}
        className={`ml-4 transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
      >
        ✕
      </button>
    </div>
  );
};

export default Toast;
