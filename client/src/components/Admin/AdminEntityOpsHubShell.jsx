import { useMemo } from 'react';
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

  return (
    <AdminUserPanelShell title={title} hint={hint} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <AdminUserPicker
          orgId={orgId}
          selectedUserId={userId}
          hint={resolvedPickerHint}
          filterFn={resolvedPickerFilterFn}
          subtitleFn={resolvedPickerSubtitleFn}
          emptyLabel={resolvedPickerEmptyLabel}
        />
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={title}>
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(tab.id)}
                  className={[
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div role="tabpanel">{children({ activeTab, userId })}</div>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}
