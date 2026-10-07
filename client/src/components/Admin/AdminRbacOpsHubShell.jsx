import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminUserPanelShell } from '../adminUsers/adminUserPanelUi';
import { AdminHubTablist, AdminHubTabPanel, useAdminHubTabIds } from './AdminHubTablist';

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
  const tabIdPrefix = useAdminHubTabIds();

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
    <AdminUserPanelShell title={title} hint={hint} wide fillHeight>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-stretch">
        <div className="flex min-h-0 min-w-0 flex-col">{renderPicker?.(activeTab)}</div>
        <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto">
          <AdminHubTablist
            idPrefix={tabIdPrefix}
            label={title}
            tabs={tabs}
            activeTab={activeTab}
            onSelect={setTab}
          />
          <AdminHubTabPanel idPrefix={tabIdPrefix} tabs={tabs} activeTab={activeTab}>
            {children({ activeTab })}
          </AdminHubTabPanel>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}

