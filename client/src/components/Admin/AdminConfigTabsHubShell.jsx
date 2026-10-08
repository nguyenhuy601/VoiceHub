import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminUserPanelShell } from '../adminUsers/adminUserPanelUi';
import { AdminHubTablist, AdminHubTabPanel, useAdminHubTabIds } from './AdminHubTablist';

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
    <AdminUserPanelShell title={title} hint={hint} wide>
      <AdminHubTablist
        idPrefix={tabIdPrefix}
        label={title}
        tabs={tabs}
        activeTab={activeTab}
        onSelect={setTab}
        className="mb-4"
      />
      <AdminHubTabPanel idPrefix={tabIdPrefix} tabs={tabs} activeTab={activeTab}>
        {children({ activeTab })}
      </AdminHubTabPanel>
    </AdminUserPanelShell>
  );
}
