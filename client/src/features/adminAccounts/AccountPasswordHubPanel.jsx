import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminEntityOpsHubShell from '../../components/admin/AdminEntityOpsHubShell';
import AccountResetPasswordPanel from './AccountResetPasswordPanel';
import AccountForcePasswordPanel from './AccountForcePasswordPanel';
import AccountSetPasswordPanel from './AccountSetPasswordPanel';

const TAB_RESET = 'reset';
const TAB_FORCE = 'force';
const TAB_SET = 'set';

export default function AccountPasswordHubPanel({ orgId }) {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [
      { id: TAB_RESET, label: t('adminDomains.accounts.resetPassword') },
      { id: TAB_FORCE, label: t('adminDomains.accounts.forcePassword') },
      { id: TAB_SET, label: t('adminDomains.accounts.setPassword') },
    ],
    [t]
  );

  return (
    <AdminEntityOpsHubShell
      title={t('adminDomains.accounts.passwordHub')}
      hint={t('adminAccounts.passwordHubHint')}
      orgId={orgId}
      tabs={tabs}
      defaultTab={TAB_RESET}
      pickerHint={t('adminAccounts.passwordHubPickerHint')}
    >
      {({ activeTab }) => (
        <>
          {activeTab === TAB_RESET ? <AccountResetPasswordPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_FORCE ? <AccountForcePasswordPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_SET ? <AccountSetPasswordPanel orgId={orgId} embedded /> : null}
        </>
      )}
    </AdminEntityOpsHubShell>
  );
}
