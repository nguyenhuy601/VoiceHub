import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminConfigTabsHubShell from '../../components/admin/AdminConfigTabsHubShell';
import AdminComingSoonEmbed from '../../components/admin/AdminComingSoonEmbed';

const TAB_SMTP = 'smtp';
const TAB_PUSH = 'push';
const TAB_WEBHOOK = 'webhook';
const TAB_BROADCAST = 'broadcast';

export default function NotificationConfigHubPanel() {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [
      { id: TAB_SMTP, label: t('adminDomains.notifications.smtp') },
      { id: TAB_PUSH, label: t('adminDomains.notifications.push') },
      { id: TAB_WEBHOOK, label: t('adminDomains.notifications.webhook') },
      { id: TAB_BROADCAST, label: t('adminDomains.notifications.broadcast') },
    ],
    [t]
  );

  return (
    <AdminConfigTabsHubShell
      title={t('adminDomains.notifications.configHub')}
      hint={t('adminNotifications.configHubHint')}
      tabs={tabs}
      defaultTab={TAB_SMTP}
    >
      {({ activeTab }) => (
        <AdminComingSoonEmbed
          title={tabs.find((tab) => tab.id === activeTab)?.label || t('adminDomains.notifications.configHub')}
          hint={t('adminNotifications.tabComingSoonHint')}
        />
      )}
    </AdminConfigTabsHubShell>
  );
}
