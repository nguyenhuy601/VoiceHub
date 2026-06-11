import { Grid3x3, MessageSquare, LayoutGrid, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useWorkspaceSuite, SUITE } from '../../context/WorkspaceSuiteContext';
import { useAppStrings } from '../../locales/appStrings';
import { getDefaultPathForSuite } from '../../utils/suitePathUtils';

const SUITE_META = [
  {
    id: SUITE.COMMUNICATE,
    Icon: MessageSquare,
    labelKey: 'communicate',
    fallbackLabel: 'Communicate',
    fallbackDesc: 'Chat, kênh, voice',
    accent: 'from-cyan-500/20 to-blue-500/10 border-cyan-400/40',
  },
  {
    id: SUITE.COLLABORATE,
    Icon: LayoutGrid,
    labelKey: 'collaborate',
    fallbackLabel: 'Collaborate',
    fallbackDesc: 'Tasks, tài liệu',
    accent: 'from-violet-500/20 to-fuchsia-500/10 border-violet-400/40',
  },
  {
    id: SUITE.ME,
    Icon: User,
    labelKey: 'me',
    fallbackLabel: 'Me',
    fallbackDesc: 'Dashboard, lịch, cài đặt',
    accent: 'from-amber-500/20 to-orange-500/10 border-amber-400/40',
  },
];

const AppSwitcher = () => {
  const [open, setOpen] = useState(false);
  const { isDarkMode } = useTheme();
  const { currentSuite, navigateToSuite } = useWorkspaceSuite();
  const { t } = useAppStrings();
  const location = useLocation();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    close();
  }, [location.pathname, close]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const handleSelect = (suiteId) => {
    if (suiteId === currentSuite) {
      close();
      return;
    }
    navigateToSuite(suiteId, { path: getDefaultPathForSuite(suiteId) });
    close();
  };

  const btnClass = isDarkMode
    ? 'bg-[#10131b]/90 border-white/10 text-slate-100 hover:bg-white/10 shadow-lg shadow-black/30'
    : 'bg-white/95 border-slate-200 text-slate-800 hover:bg-slate-50 shadow-lg shadow-slate-200/60';

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={`fixed left-3 top-3 z-[1200] flex h-10 w-10 items-center justify-center rounded-xl border backdrop-blur-md transition ${btnClass}`}
      aria-label={t('suite.switcherOpen') || 'Chuyển suite'}
      aria-expanded={open}
    >
      <Grid3x3 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
    </button>
  );

  const modal =
    open &&
    createPortal(
      <>
        <div
          className="fixed inset-0 z-[1195] bg-black/50 backdrop-blur-[2px]"
          onClick={close}
          aria-hidden
        />
        <div
          className={`fixed left-1/2 top-1/2 z-[1200] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5 shadow-2xl ${
            isDarkMode
              ? 'border-white/10 bg-[#111622] text-slate-100'
              : 'border-slate-200 bg-white text-slate-900'
          }`}
          role="dialog"
          aria-modal="true"
          aria-label={t('suite.switcherTitle') || 'Chọn không gian làm việc'}
        >
          <h2 className="mb-1 text-lg font-bold">
            {t('suite.switcherTitle') || 'Chọn không gian'}
          </h2>
          <p className={`mb-4 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {t('suite.switcherHint') || 'Communicate · Collaborate · Me'}
          </p>
          <div className="grid gap-3">
            {SUITE_META.map(({ id, Icon, labelKey, fallbackLabel, fallbackDesc, accent }) => {
              const active = id === currentSuite;
              const label = t(`suite.${labelKey}`) || fallbackLabel;
              const desc = t(`suite.${labelKey}Desc`) || fallbackDesc;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelect(id)}
                  className={`flex w-full items-center gap-4 rounded-xl border bg-gradient-to-r p-4 text-left transition ${
                    active
                      ? `${accent} ring-2 ring-cyan-400/50`
                      : isDarkMode
                        ? 'border-white/10 bg-white/5 hover:bg-white/10'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      isDarkMode ? 'bg-white/10' : 'bg-white shadow-sm'
                    }`}
                  >
                    <Icon className="h-5 w-5 text-cyan-500" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{label}</span>
                    <span className={`block text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {desc}
                    </span>
                  </span>
                  {active && (
                    <span className="ml-auto text-xs font-medium text-cyan-400">
                      {t('suite.current') || 'Đang dùng'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </>,
      document.body
    );

  return (
    <>
      {typeof document !== 'undefined' ? createPortal(trigger, document.body) : trigger}
      {modal}
    </>
  );
};

export default AppSwitcher;
