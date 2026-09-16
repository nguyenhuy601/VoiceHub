import { useAppStrings } from '../../locales/appStrings';
import NotificationsPage from '../../pages/Notifications/NotificationsPage';

/**
 * Thông báo tổ chức trong workspace — cùng Inbox gold với Communicate / company route.
 * Dữ liệu thật qua NotificationsPage (scope organization).
 */
export default function OrganizationNotificationsWorkspacePanel({
  organizationId,
  organizationSlug: _organizationSlug = '',
  isDarkMode: _isDarkMode,
  fetchEnabled = true,
}) {
  const { t } = useAppStrings();
  const orgId = organizationId ? String(organizationId) : '';

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <NotificationsPage
        orgScope
        embedded
        organizationIdOverride={orgId}
        fetchEnabled={fetchEnabled && Boolean(orgId)}
        pageTitle={t('notifications.titleOrganization')}
      />
    </div>
  );
}
