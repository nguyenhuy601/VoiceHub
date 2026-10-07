import { useMemo } from 'react';
import { Check, Lock } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import AdminConfigTabsHubShell from '../../components/Admin/AdminConfigTabsHubShell';
import { AdminUserFormCard } from '../../components/adminUsers/adminUserPanelUi';
import { SecurityWaveCStubPanel } from '../adminTasks/BackupOpsPanel';
import { useCompanyAdminContext } from '../../pages/Admin/CompanyAdminLayout';
import {
  LOGIN_LOCK_HOURS,
  LOGIN_LOCK_MAX_ATTEMPTS,
  PASSWORD_RULE_KEYS,
} from '../adminAccounts/passwordPolicy';

const TAB_PASSWORD = 'password';
const TAB_MFA = 'mfa';
const TAB_IP = 'ip-whitelist';

function PasswordPolicyCard() {
  const { t } = useAppStrings();
  return (
    <AdminUserFormCard title={t('adminSecurity.passwordPolicyTitle')} hint={t('adminSecurity.passwordPolicyHint')}>
      <ul className="space-y-2 text-sm" aria-label={t('adminSecurity.passwordPolicyTitle')}>
        {PASSWORD_RULE_KEYS.map((key) => (
          <li key={key} className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
            <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
            <span className="text-foreground">{t(`adminAccounts.passwordRule_${key}`)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
          <Lock className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span className="text-foreground">
            {t('adminSecurity.lockoutRule', { hours: LOGIN_LOCK_HOURS, attempts: LOGIN_LOCK_MAX_ATTEMPTS })}
          </span>
        </li>
      </ul>
    </AdminUserFormCard>
  );
}

export default function SecuritySettingsHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const { isFullAccess } = useCompanyAdminContext();

  const tabs = useMemo(
    () => [
      { id: TAB_PASSWORD, label: t('adminDomains.security.passwordPolicy') },
      { id: TAB_MFA, label: t('adminDomains.security.mfa') },
      { id: TAB_IP, label: t('adminDomains.security.ipWhitelist') },
    ],
    [t]
  );

  return (
    <AdminConfigTabsHubShell
      title={t('adminDomains.security.settingsHub')}
      hint={t('adminSecurity.settingsHubHint')}
      tabs={tabs}
      defaultTab={TAB_PASSWORD}
    >
      {({ activeTab }) => {
        if (activeTab === TAB_PASSWORD) {
          if (!isFullAccess) {
            return (
              <p role="alert" className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                {t('adminDomains.noPermission')}
              </p>
            );
          }
          return <PasswordPolicyCard />;
        }
        if (activeTab === TAB_IP) return <SecurityWaveCStubPanel orgId={orgId} focus="ip" embedded />;
        return <SecurityWaveCStubPanel orgId={orgId} focus="mfa" embedded />;
      }}
    </AdminConfigTabsHubShell>
  );
}
