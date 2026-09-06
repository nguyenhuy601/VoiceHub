import { Megaphone } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';

/**
 * Chrome Thông báo phòng — Mattermost-like announce (không phải chat team / không CTA task).
 * children tùy chọn: chỉ banner khi không truyền.
 */
export default function DepartmentAnnouncementSurface({
  departmentName = '',
  isDarkMode = false,
  children = null,
}) {
  const { t } = useAppStrings();
  const muted = isDarkMode ? 'text-amber-100/80' : 'text-amber-950/75';
  const shell = isDarkMode
    ? 'border-amber-500/25 bg-gradient-to-b from-amber-500/10 to-transparent'
    : 'border-amber-500/30 bg-gradient-to-b from-amber-50 to-transparent';
  const name = String(departmentName || '').trim();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`sticky top-0 z-10 mb-3 shrink-0 rounded-xl border px-3 py-3 sm:px-4 ${shell}`}
        role="region"
        aria-label={t('workspace.moduleAnnouncement')}
      >
        <div className="flex items-start gap-2.5">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              isDarkMode ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'
            }`}
          >
            <Megaphone size={16} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-bold ${isDarkMode ? 'text-amber-50' : 'text-amber-950'}`}>
              {name
                ? t('workspace.deptAnnounceTitle', { name })
                : t('workspace.moduleAnnouncement')}
            </p>
            <p className={`mt-0.5 text-[0.6875rem] leading-relaxed ${muted}`}>
              {t('workspace.deptAnnounceBanner')}
            </p>
            <p className={`mt-1.5 text-[0.625rem] font-semibold uppercase tracking-wide ${muted}`}>
              {t('workspace.deptAnnounceNoTaskNote')}
            </p>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Empty state khi chưa có bài thông báo. */
export function DepartmentAnnouncementEmpty({ isDarkMode = false }) {
  const { t } = useAppStrings();
  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center ${
        isDarkMode ? 'border-amber-500/20 bg-amber-500/5' : 'border-amber-500/25 bg-amber-50/60'
      }`}
    >
      <Megaphone
        size={28}
        className="mb-3 text-amber-600 opacity-80 dark:text-amber-400"
        aria-hidden
      />
      <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-foreground'}`}>
        {t('workspace.deptAnnounceEmptyTitle')}
      </p>
      <p className={`mt-1 max-w-sm text-[0.75rem] leading-relaxed ${muted}`}>
        {t('workspace.deptAnnounceEmpty')}
      </p>
    </div>
  );
}
