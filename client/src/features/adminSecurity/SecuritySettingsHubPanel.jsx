import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminConfigTabsHubShell from '../../components/admin/AdminConfigTabsHubShell';
import AdminComingSoonEmbed from '../../components/admin/AdminComingSoonEmbed';
import OrganizationSettingsPanel from '../../components/Organization/OrganizationSettingsPanel';
import { SecurityWaveCStubPanel } from '../adminTasks/BackupOpsPanel';
import { useCompanyAdminContext } from '../../pages/Admin/CompanyAdminLayout';

const TAB_PASSWORD = 'password';
const TAB_MFA = 'mfa';
const TAB_TIMEOUT = 'session-timeout';
const TAB_IP = 'ip-whitelist';

export default function SecuritySettingsHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const { organization, isFullAccess, refreshOrganization } = useCompanyAdminContext();

  const tabs = useMemo(
    () => [
      { id: TAB_PASSWORD, label: t('adminDomains.security.passwordPolicy') },
      { id: TAB_MFA, label: t('adminDomains.security.mfa') },
      { id: TAB_TIMEOUT, label: t('adminDomains.security.sessionTimeout') },
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
        if (activeTab === TAB_PASSWORD && isFullAccess && organization) {
          return (
            <OrganizationSettingsPanel
              organization={organization}
              initialTab="security"
              lockTab="security"
              hideChrome
              hideBranchUi
              suiteLayout={false}
              onOrganizationUpdated={refreshOrganization}
            />
          );
        }
        if (activeTab === TAB_MFA || activeTab === TAB_IP) {
          return <SecurityWaveCStubPanel orgId={orgId} embedded />;
        }
        return (
          <AdminComingSoonEmbed
            title={tabs.find((tab) => tab.id === activeTab)?.label || t('adminDomains.security.settingsHub')}
            hint={t('adminSecurity.tabComingSoonHint')}
          />
        );
      }}
    </AdminConfigTabsHubShell>
  );
}
