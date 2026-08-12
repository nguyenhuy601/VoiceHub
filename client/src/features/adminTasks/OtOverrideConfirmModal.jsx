import { createPortal } from 'react-dom';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

/**
 * Soft OT override — PM nhập rationale bắt buộc trước khi gán vượt maxConcurrentProjects.
 */
export default function OtOverrideConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  currentActiveProjects = null,
  maxConfigured = null,
  title = 'Cảnh báo Overtime (OT)',
  confirmText = 'Override & gán tiếp',
  cancelText = 'Hủy',
  rationaleLabel = 'Lý do override',
  rationalePlaceholder = 'Ví dụ: Sprint gấp, chưa có người thay thế…',
  rationaleRequiredText = 'Vui lòng nhập lý do override.',
  message = null,
  busy = false,
}) {
  const { isDarkMode } = useTheme();
  const [rationale, setRationale] = useState('');
  const [localError, setLocalError] = useState('');

  if (!isOpen || typeof document === 'undefined') return null;

  const shell = isDarkMode
    ? 'border border-amber-500/35 bg-slate-900/95 shadow-2xl shadow-amber-900/20'
    : 'border border-amber-400/40 bg-white shadow-2xl shadow-slate-900/10';
  const titleCls = isDarkMode ? 'text-white' : 'text-slate-900';
  const bodyCls = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const inputCls = isDarkMode
    ? 'w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-100'
    : 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900';
  const cancelBtn = isDarkMode
    ? 'glass border border-white/10 bg-white/[0.06] px-4 py-3 font-semibold text-slate-100 hover:bg-white/10'
    : 'border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800 shadow-sm hover:bg-slate-50';

  const handleClose = () => {
    if (busy) return;
    setRationale('');
    setLocalError('');
    onClose?.();
  };

  const handleConfirm = () => {
    const text = String(rationale || '').trim();
    if (!text) {
      setLocalError(rationaleRequiredText);
      return;
    }
    const ret = onConfirm?.(text);
    Promise.resolve(ret).finally(() => {
      setRationale('');
      setLocalError('');
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10100] flex items-center justify-center p-4 animate-fadeIn"
      onClick={handleClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden />
      <div
        className={`relative w-full max-w-md rounded-2xl animate-scaleIn backdrop-blur-md ${shell}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ot-override-title"
      >
        <div className="p-6">
          <h3 id="ot-override-title" className={`mb-2 text-xl font-bold ${titleCls}`}>
            {title}
          </h3>
          <p className={`mb-3 text-sm leading-relaxed ${bodyCls}`}>
            {message != null ? (
              message
            ) : (
              <>
                Nhân viên đang tham gia{' '}
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {currentActiveProjects ?? '—'}
                </span>{' '}
                dự án active (ngưỡng cấu hình:{' '}
                <span className="font-semibold">{maxConfigured ?? '—'}</span>). Gán thêm sẽ vượt công
                suất — nhập lý do để override (ghi audit log cho HR).
              </>
            )}
          </p>
          <label className={`mb-1.5 block text-xs font-medium ${bodyCls}`}>{rationaleLabel}</label>
          <textarea
            rows={3}
            className={inputCls}
            value={rationale}
            disabled={busy}
            onChange={(e) => {
              setRationale(e.target.value);
              if (localError) setLocalError('');
            }}
            placeholder={rationalePlaceholder}
          />
          {localError ? <p className="mt-1.5 text-xs text-red-500">{localError}</p> : null}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className={`flex-1 rounded-xl transition-all disabled:opacity-50 ${cancelBtn}`}
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 px-4 py-3 font-semibold text-[#0f1218] shadow-md shadow-amber-900/25 transition-all hover:from-amber-500 hover:to-yellow-500 disabled:opacity-50"
            >
              {busy ? '…' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
