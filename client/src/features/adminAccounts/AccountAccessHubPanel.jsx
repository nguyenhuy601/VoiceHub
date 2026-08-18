import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminEntityOpsHubShell from '../../components/admin/AdminEntityOpsHubShell';
import AccountActivatePanel from './AccountActivatePanel';
import AccountLockPanel from './AccountLockPanel';
import AccountRevokeSessionsPanel from './AccountRevokeSessionsPanel';

const TAB_ACTIVATE = 'activate';
const TAB_LOCK = 'lock';
const TAB_REVOKE = 'revoke';

export default function AccountAccessHubPanel({ orgId }) {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [
      { id: TAB_ACTIVATE, label: t('adminDomains.accounts.activate') },
      { id: TAB_LOCK, label: t('adminDomains.accounts.lock') },
      { id: TAB_REVOKE, label: t('adminDomains.accounts.revokeSessions') },
    ],
    [t]
  );

  return (
    <AdminEntityOpsHubShell
      title={t('adminDomains.accounts.accessHub')}
      hint={t('adminAccounts.accessHubHint')}
      orgId={orgId}
      tabs={tabs}
      defaultTab={TAB_LOCK}
      pickerHint={t('adminAccounts.accessHubPickerHint')}
    >
      {({ activeTab }) => (
        <>
          {activeTab === TAB_ACTIVATE ? <AccountActivatePanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_LOCK ? <AccountLockPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_REVOKE ? <AccountRevokeSessionsPanel orgId={orgId} embedded /> : null}
        </>
      )}
    </AdminEntityOpsHubShell>
  );
}
