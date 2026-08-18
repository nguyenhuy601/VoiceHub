import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminEntityOpsHubShell from '../../components/admin/AdminEntityOpsHubShell';
import AdminComingSoonEmbed from '../../components/admin/AdminComingSoonEmbed';
import AccountLoginHistoryPanel from '../adminAccounts/AccountLoginHistoryPanel';

const TAB_SESSIONS = 'sessions';
const TAB_DEVICES = 'devices';
const TAB_HISTORY = 'history';

export default function SecuritySessionsHubPanel({ orgId }) {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [
      { id: TAB_SESSIONS, label: t('adminDomains.security.sessions') },
      { id: TAB_DEVICES, label: t('adminDomains.security.devices') },
      { id: TAB_HISTORY, label: t('adminDomains.security.loginHistory') },
    ],
    [t]
  );

  return (
    <AdminEntityOpsHubShell
      title={t('adminDomains.security.sessionsHub')}
      hint={t('adminSecurity.sessionsHubHint')}
      orgId={orgId}
      tabs={tabs}
      defaultTab={TAB_SESSIONS}
      pickerHint={t('adminSecurity.sessionsPickerHint')}
    >
      {({ activeTab }) => {
        if (activeTab === TAB_HISTORY) {
          return <AccountLoginHistoryPanel orgId={orgId} embedded />;
        }
        return (
          <AdminComingSoonEmbed
            title={tabs.find((tab) => tab.id === activeTab)?.label || t('adminDomains.security.sessionsHub')}
            hint={t('adminSecurity.tabComingSoonHint')}
          />
        );
      }}
    </AdminEntityOpsHubShell>
  );
}
