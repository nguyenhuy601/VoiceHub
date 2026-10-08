import { useMemo } from 'react';
import { Briefcase } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppStrings } from '../../locales/appStrings';
import { coalesceJobTitle } from '../../utils/jobTitleProfile';
import { FIGMA_SIDEBAR_FOOTER } from './figmaShellClasses';

function humanizeKey(key) {
  return String(key || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatSidebarPositionLabel(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^[a-z0-9_]+$/i.test(text) && text.includes('_')) {
    return humanizeKey(text);
  }
  return text;
}

/**
 * Footer chip: account Position (jobTitle) — used outside project context
 * (project list, Communicate, Company space).
 */
export default function SidebarPositionFooter({ collapsed = false, wrap = true }) {
  const { t } = useAppStrings();
  const { user } = useAuth();
  const label = useMemo(
    () => formatSidebarPositionLabel(coalesceJobTitle(user)),
    [user]
  );

  const body = collapsed ? (
    <div
      className="flex flex-col items-center gap-1 py-0.5"
      title={label || t('nav.positionUnassigned') || 'Chưa gán chức danh'}
    >
      <Briefcase size={14} className="text-white/35" aria-hidden />
      {label ? (
        <span className="inline-flex max-w-full truncate rounded bg-sky-500/20 px-1 py-0.5 text-[0.55rem] font-bold tracking-wide text-sky-200">
          {label.length > 8 ? `${label.slice(0, 8)}…` : label}
        </span>
      ) : null}
    </div>
  ) : (
    <div className="px-1.5 py-1">
      <div className="mb-1 flex items-center gap-1.5 text-[0.55rem] font-bold uppercase tracking-wider text-white/25">
        <Briefcase size={10} aria-hidden />
        {t('nav.yourPosition') || 'Position'}
      </div>
      {label ? (
        <span
          title={label}
          className="inline-flex max-w-full items-center truncate rounded bg-sky-500/20 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-sky-200"
        >
          {label}
        </span>
      ) : (
        <p className="text-[0.625rem] text-white/35">
          {t('nav.positionUnassigned') || 'Chưa gán chức danh'}
        </p>
      )}
    </div>
  );

  if (!wrap) return body;
  return <div className={FIGMA_SIDEBAR_FOOTER}>{body}</div>;
}
