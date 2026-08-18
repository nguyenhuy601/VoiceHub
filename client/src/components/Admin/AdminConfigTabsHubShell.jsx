import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminUserPanelShell } from '../adminUsers/adminUserPanelUi';

/**
 * Hub cấu hình toàn công ty: chỉ tabs (không picker entity).
 * Tab lưu URL ?tab=.
 */
export default function AdminConfigTabsHubShell({
  title,
  hint,
  tabs,
  defaultTab,
  tabParam = 'tab',
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
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label={title}>
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
    </AdminUserPanelShell>
  );
}
