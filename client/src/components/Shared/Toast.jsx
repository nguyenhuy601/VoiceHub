/**
 * Thông báo nổi trong trang (khác react-hot-toast Toaster toàn cục).
 * Dùng với state: const [toast, setToast] = useState(null);
 */
function Toast({ message, type = 'success', onClose }) {
  const isError = type === 'error' || type === 'fail';
  return (
    <div
      role="status"
      className={`fixed bottom-6 left-1/2 z-[10000] flex max-w-[min(100vw-2rem,28rem)] -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md ${
        isError
          ? 'border-red-500/40 bg-red-950/90 text-red-50'
          : 'border-emerald-500/40 bg-emerald-950/90 text-emerald-50'
      }`}
    >
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none opacity-80 hover:opacity-100"
        aria-label="Đóng"
      >
        ×
      </button>
    </div>
  );
}

export default Toast;
