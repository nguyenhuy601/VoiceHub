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

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <NotificationsPage
        orgScope
        embedded
        organizationIdOverride={organizationId}
        fetchEnabled={fetchEnabled && Boolean(organizationId)}
        pageTitle={t('notifications.titleOrganization')}
      />
    </div>
  );
}
