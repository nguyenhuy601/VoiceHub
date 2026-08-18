import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminUserPanelShell } from '../adminUsers/adminUserPanelUi';

/**
 * Hub RBAC linh hoạt: picker tùy tab (user / org role / system role) + tabs.
 */
export default function AdminRbacOpsHubShell({
  title,
  hint,
  tabs,
  defaultTab,
  tabParam = 'tab',
  renderPicker,
  children,
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo(() => {
    const raw = String(searchParams.get(tabParam) || '').trim();
    if (raw && tabs.some((tab) => tab.id === raw)) return raw;
    return defaultTab;
  }, [searchParams, tabParam, tabs, defaultTab]);

  const setTab = (nextId) => {
    const params = new URLSearchParams(searchParams);
    if (nextId === defaultTab) params.delete(tabParam);
    else params.set(tabParam, nextId);
    setSearchParams(params, { replace: true });
  };

  return (
    <AdminUserPanelShell title={title} hint={hint} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="min-w-0">{renderPicker?.(activeTab)}</div>
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
          <div role="tabpanel">{children({ activeTab })}</div>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}

