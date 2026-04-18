import { useTheme } from '../../context/ThemeContext';
import { appShellBg } from '../../theme/shellTheme';

/**
 * Màn hình chờ toàn trang — đồng bộ tông nền shell (cyan/teal), dùng cho Suspense và ProtectedRoute.
 */
export default function BrandPageLoader({
  message = 'Đang tải...',
  subMessage = 'Vui lòng đợi trong giây lát',
}) {
  const { isDarkMode } = useTheme();

  return (
    <div
      className={`relative flex min-h-screen items-center justify-center overflow-hidden ${appShellBg(isDarkMode)}`}
    >
      <div className="pointer-events-none absolute inset-0">
        {isDarkMode ? (
          <>
            <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="absolute -bottom-20 right-0 h-64 w-64 rounded-full bg-teal-600/10 blur-3xl" />
          </>
        ) : (
          <>
            <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
            <div className="absolute -bottom-20 right-0 h-64 w-64 rounded-full bg-teal-400/12 blur-3xl" />
          </>
        )}
      </div>

      <div className="relative z-10 px-6 text-center">
        <div
          className="mx-auto mb-5 h-11 w-11 rounded-full border-2 border-cyan-500/25 border-t-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.2)] animate-spin"
          role="status"
          aria-label={message}
        />
        <p
          className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
        >
          {message}
        </p>
        <p className={`mt-1.5 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          {subMessage}
        </p>
      </div>
    </div>
  );
}
