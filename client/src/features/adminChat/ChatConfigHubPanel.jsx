import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminConfigTabsHubShell from '../../components/admin/AdminConfigTabsHubShell';
import AdminComingSoonEmbed from '../../components/admin/AdminComingSoonEmbed';

const TAB_HISTORY = 'history';
const TAB_RESTORE = 'restore';
const TAB_PIN = 'pin';
const TAB_BROADCAST = 'broadcast';
const TAB_SEARCH = 'search';
const TAB_EXPORT = 'export';
const TAB_RETENTION = 'retention';
const TAB_DELETE = 'delete';

export default function ChatConfigHubPanel() {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [
      { id: TAB_HISTORY, label: t('adminDomains.chat.history') },
      { id: TAB_RESTORE, label: t('adminDomains.chat.restore') },
      { id: TAB_PIN, label: t('adminDomains.chat.pin') },
      { id: TAB_BROADCAST, label: t('adminDomains.chat.broadcast') },
      { id: TAB_SEARCH, label: t('adminDomains.chat.search') },
      { id: TAB_EXPORT, label: t('adminDomains.chat.export') },
      { id: TAB_RETENTION, label: t('adminDomains.chat.retention') },
      { id: TAB_DELETE, label: t('adminDomains.chat.delete') },
    ],
    [t]
  );

  return (
    <AdminConfigTabsHubShell
      title={t('adminDomains.chat.configHub')}
      hint={t('adminChat.configHubHint')}
      tabs={tabs}
      defaultTab={TAB_HISTORY}
    >
      {({ activeTab }) => (
        <AdminComingSoonEmbed
          title={tabs.find((tab) => tab.id === activeTab)?.label || t('adminDomains.chat.configHub')}
          hint={t('adminChat.tabComingSoonHint')}
        />
      )}
    </AdminConfigTabsHubShell>
  );
}
