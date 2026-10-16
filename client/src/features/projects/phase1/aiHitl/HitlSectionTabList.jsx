/**
 * Shared underline section tabs for Monitor + Gate1/Gate2 Review (emerald/amber + issue icon).
 */

import { AlertTriangle } from 'lucide-react';

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  return value || fallback;
}

/**
 * @param {object} props
 * @param {Array<{ key: string, label?: string }>} props.tabs
 * @param {string} props.activeKey
 * @param {(key: string) => void} props.onSelect
 * @param {(tab: object) => boolean} [props.tabHasIssue]
 * @param {function} props.t
 * @param {string} props.ariaLabel
 */
export default function HitlSectionTabList({
  tabs = [],
  activeKey = '',
  onSelect,
  tabHasIssue = null,
  t,
  ariaLabel = '',
}) {
  if (!tabs.length) return null;

  return (
    <div className="mt-3 border-b border-border">
      <div
        className="flex gap-0 overflow-x-auto overscroll-x-contain"
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map((tab) => {
          const isActive = activeKey === tab.key;
          const hasIssue = typeof tabHasIssue === 'function' ? Boolean(tabHasIssue(tab)) : false;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                if (typeof onSelect === 'function') onSelect(tab.key);
              }}
              className={`relative shrink-0 border-b-2 px-3 py-2 pr-5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive
                  ? hasIssue
                    ? 'border-amber-600 text-amber-900 dark:border-amber-400 dark:text-amber-100'
                    : 'border-emerald-600 text-emerald-800 dark:border-emerald-400 dark:text-emerald-100'
                  : hasIssue
                    ? 'border-transparent text-amber-800/80 hover:text-amber-950 dark:text-amber-200/80'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="whitespace-nowrap">{tab.label || tab.key}</span>
              {hasIssue ? (
                <AlertTriangle
                  className="pointer-events-none absolute right-1 top-1 h-3 w-3 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
              ) : null}
              <span className="sr-only">
                {hasIssue
                  ? labelOf(t, 'requirements.phase1Gate1TabHasIssue', 'Có cảnh báo')
                  : labelOf(t, 'requirements.phase1Gate1TabOk', 'Đạt')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
