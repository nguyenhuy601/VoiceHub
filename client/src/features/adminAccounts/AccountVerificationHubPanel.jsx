import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminEntityOpsHubShell from '../../components/admin/AdminEntityOpsHubShell';
import AccountResendVerificationPanel from './AccountResendVerificationPanel';

const TAB_RESEND = 'resend';

export default function AccountVerificationHubPanel({ orgId }) {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [{ id: TAB_RESEND, label: t('adminDomains.accounts.resendVerification') }],
    [t]
  );

  return (
    <AdminEntityOpsHubShell
      title={t('adminDomains.accounts.verificationHub')}
      hint={t('adminAccounts.verificationHubHint')}
      orgId={orgId}
      tabs={tabs}
      defaultTab={TAB_RESEND}
      pickerHint={t('adminAccounts.resendPickerHint')}
    >
      {() => <AccountResendVerificationPanel orgId={orgId} embedded />}
    </AdminEntityOpsHubShell>
  );
}
