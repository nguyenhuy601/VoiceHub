import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminOrgUnitPicker from '../adminOrgStructure/AdminOrgUnitPicker';
import { AdminUserPanelShell } from '../adminUsers/adminUserPanelUi';

/**
 * Khung hub org unit: 1 picker + tabs thao tác (Dept / Team / Division / Branch).
 * unitId qua ?unitId= (AdminOrgUnitPicker).
 *
 * @param {{
 *   title: string,
 *   hint?: string,
 *   tabs: Array<{ id: string, label: string }>,
 *   defaultTab: string,
 *   tabParam?: string,
 *   items: object[],
 *   loading?: boolean,
 *   error?: string,
 *   onRetry?: () => void,
 *   pickerHint?: string,
 *   subtitleFn?: (row: object) => string,
 *   badgeFn?: (row: object) => string,
 *   getPickerProps?: (activeTab: string) => {
 *     pickerHint?: string,
 *     subtitleFn?: (row: object) => string,
 *     badgeFn?: (row: object) => string,
 *     items?: object[],
 *   },
 *   children: (ctx: { activeTab: string, unitId: string }) => import('react').ReactNode,
 * }} props
 */
export default function AdminOrgUnitOpsHubShell({
  title,
  hint,
  tabs,
  defaultTab,
  tabParam = 'tab',
  items,
  loading = false,
  error = '',
  onRetry,
  pickerHint,
  subtitleFn,
  badgeFn,
  getPickerProps,
  children,
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo(() => {
    const raw = String(searchParams.get(tabParam) || '').trim();
    if (raw && tabs.some((tab) => tab.id === raw)) return raw;
    return defaultTab;
  }, [searchParams, tabParam, tabs, defaultTab]);

  const unitId = String(searchParams.get('unitId') || '').trim();

  const pickerOverride = getPickerProps?.(activeTab) || {};
  const resolvedItems = pickerOverride.items ?? items;
  const resolvedPickerHint = pickerOverride.pickerHint ?? pickerHint;
  const resolvedSubtitleFn = pickerOverride.subtitleFn ?? subtitleFn;
  const resolvedBadgeFn = pickerOverride.badgeFn ?? badgeFn;

  const setTab = (nextId) => {
    const params = new URLSearchParams(searchParams);
    if (nextId === defaultTab) params.delete(tabParam);
    else params.set(tabParam, nextId);
    setSearchParams(params, { replace: true });
  };

  return (
    <AdminUserPanelShell title={title} hint={hint} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={resolvedItems}
          loading={loading}
          error={error}
          onRetry={onRetry}
          selectedId={unitId}
          hint={resolvedPickerHint}
          subtitleFn={resolvedSubtitleFn}
          badgeFn={resolvedBadgeFn}
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
          <div role="tabpanel">{children({ activeTab, unitId })}</div>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}

