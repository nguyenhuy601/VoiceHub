import { useId, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminUserPicker from '../adminUsers/AdminUserPicker';
import { AdminUserPanelShell } from '../adminUsers/adminUserPanelUi';

/**
 * Khung trang hub: 1 picker entity + tabs thao tác (Accounts / Users people-ops).
 * Tab lưu URL ?tab=; userId qua ?userId= (AdminUserPicker).
 *
 * @param {{
 *   title: string,
 *   hint?: string,
 *   orgId: string,
 *   tabs: Array<{ id: string, label: string }>,
 *   defaultTab: string,
 *   tabParam?: string,
 *   pickerHint?: string,
 *   pickerFilterFn?: (member: object) => boolean,
 *   pickerSubtitleFn?: (member: object) => string,
 *   pickerEmptyLabel?: string,
 *   getPickerProps?: (activeTab: string) => {
 *     pickerHint?: string,
 *     pickerFilterFn?: (member: object) => boolean,
 *     pickerSubtitleFn?: (member: object) => string,
 *     pickerEmptyLabel?: string,
 *   },
 *   children: (ctx: { activeTab: string, userId: string }) => import('react').ReactNode,
 * }} props
 */
export default function AdminEntityOpsHubShell({
  title,
  hint,
  orgId,
  tabs,
  defaultTab,
  tabParam = 'tab',
  pickerHint,
  pickerFilterFn,
  pickerSubtitleFn,
  pickerEmptyLabel,
  getPickerProps,
  children,
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo(() => {
    const raw = String(searchParams.get(tabParam) || '').trim();
    if (raw && tabs.some((tab) => tab.id === raw)) return raw;
    return defaultTab;
  }, [searchParams, tabParam, tabs, defaultTab]);

  const userId = String(searchParams.get('userId') || '').trim();

  const pickerOverride = getPickerProps?.(activeTab) || {};
  const resolvedPickerHint = pickerOverride.pickerHint ?? pickerHint;
  const resolvedPickerFilterFn = pickerOverride.pickerFilterFn ?? pickerFilterFn;
  const resolvedPickerSubtitleFn = pickerOverride.pickerSubtitleFn ?? pickerSubtitleFn;
  const resolvedPickerEmptyLabel = pickerOverride.pickerEmptyLabel ?? pickerEmptyLabel;

  const setTab = (nextId) => {
    const params = new URLSearchParams(searchParams);
    if (nextId === defaultTab) params.delete(tabParam);
    else params.set(tabParam, nextId);
    setSearchParams(params, { replace: true });
  };

  const tabIdPrefix = `hub-${useId().replace(/:/g, '')}`;
  const tabRefs = useRef({});
  const showTablist = tabs.length > 1;

  const focusTabAt = (index) => {
    const next = tabs[(index + tabs.length) % tabs.length];
    if (!next) return;
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  const handleTabKeyDown = (event) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    if (event.key === 'ArrowRight') focusTabAt(currentIndex + 1);
    else if (event.key === 'ArrowLeft') focusTabAt(currentIndex - 1);
    else if (event.key === 'Home') focusTabAt(0);
    else if (event.key === 'End') focusTabAt(tabs.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <AdminUserPanelShell title={title} hint={hint} wide fillHeight>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-stretch">
        <div className="min-h-0 self-stretch">
          <AdminUserPicker
            orgId={orgId}
            selectedUserId={userId}
            hint={resolvedPickerHint}
            filterFn={resolvedPickerFilterFn}
            subtitleFn={resolvedPickerSubtitleFn}
            emptyLabel={resolvedPickerEmptyLabel}
            fillHeight
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto">
          {showTablist ? (
            <div
              className="flex shrink-0 flex-wrap gap-2"
              role="tablist"
              aria-label={title}
              onKeyDown={handleTabKeyDown}
            >
              {tabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      tabRefs.current[tab.id] = el;
                    }}
                    id={`${tabIdPrefix}-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`${tabIdPrefix}-panel`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setTab(tab.id)}
                    className={[
                      'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-primary-subtle hover:text-foreground',
                    ].join(' ')}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div
            id={`${tabIdPrefix}-panel`}
            role={showTablist ? 'tabpanel' : undefined}
            aria-labelledby={showTablist ? `${tabIdPrefix}-tab-${activeTab}` : undefined}
            className="min-h-0"
          >
            {children({ activeTab, userId })}
          </div>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}
