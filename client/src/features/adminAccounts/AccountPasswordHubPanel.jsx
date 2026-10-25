import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminEntityOpsHubShell from '../../components/Admin/AdminEntityOpsHubShell';
import AccountResetPasswordPanel from './AccountResetPasswordPanel';
import AccountForcePasswordPanel from './AccountForcePasswordPanel';
import AccountSetPasswordPanel from './AccountSetPasswordPanel';
import { useAdminActionGate } from '../../hooks/useAdminActionGate';
import { RBAC_GRANT } from '../../config/rbacUiGrantMap';

const TAB_RESET = 'reset';
const TAB_FORCE = 'force';
const TAB_SET = 'set';

export default function AccountPasswordHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const { can } = useAdminActionGate(orgId);

  const tabs = useMemo(() => {
    if (!can(RBAC_GRANT.EMPLOYEE_RESET_PASSWORD)) return [];
    return [
      { id: TAB_RESET, label: t('adminDomains.accounts.resetPassword') },
      { id: TAB_FORCE, label: t('adminDomains.accounts.forcePassword') },
      { id: TAB_SET, label: t('adminDomains.accounts.setPassword') },
    ];
  }, [t, can]);

  if (!tabs.length) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        {t('adminOrg.grantDenied')}
      </p>
    );
  }

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
