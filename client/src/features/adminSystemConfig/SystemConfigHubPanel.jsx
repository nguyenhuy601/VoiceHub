import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminConfigTabsHubShell from '../../components/admin/AdminConfigTabsHubShell';
import AdminComingSoonEmbed from '../../components/admin/AdminComingSoonEmbed';
import OrganizationSettingsPanel from '../../components/Organization/OrganizationSettingsPanel';
import RetentionPolicyPanel from '../adminTasks/RetentionPolicyPanel';
import { useCompanyAdminContext } from '../../pages/Admin/CompanyAdminLayout';

const TAB_COMPANY = 'company';
const TAB_LOGO = 'logo';
const TAB_LANGUAGE = 'language';
const TAB_TIMEZONE = 'timezone';
const TAB_WORK_HOURS = 'work-hours';
const TAB_HOLIDAYS = 'holidays';
const TAB_RETENTION = 'retention';
const TAB_STRUCTURE = 'structure';

function SettingsEmbed({ organization, lockTab, onUpdated }) {
  if (!organization) return null;
  return (
    <OrganizationSettingsPanel
      organization={organization}
      initialTab={lockTab}
      lockTab={lockTab}
      hideChrome
      hideBranchUi
      suiteLayout={false}
      onOrganizationUpdated={onUpdated}
    />
  );
}

export default function SystemConfigHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const { organization, isFullAccess, refreshOrganization } = useCompanyAdminContext();

  const tabs = useMemo(
    () => [
      { id: TAB_COMPANY, label: t('adminDomains.systemConfig.company') },
      { id: TAB_LOGO, label: t('adminDomains.systemConfig.logo') },
      { id: TAB_LANGUAGE, label: t('adminDomains.systemConfig.language') },
      { id: TAB_TIMEZONE, label: t('adminDomains.systemConfig.timezone') },
      { id: TAB_WORK_HOURS, label: t('adminDomains.systemConfig.workHours') },
      { id: TAB_HOLIDAYS, label: t('adminDomains.systemConfig.holidays') },
      { id: TAB_RETENTION, label: t('adminDomains.systemConfig.retention') },
      { id: TAB_STRUCTURE, label: t('adminDomains.systemConfig.structure') },
    ],
    [t]
  );

  return (
    <AdminConfigTabsHubShell
      title={t('adminDomains.systemConfig.configHub')}
      hint={t('adminSystemConfig.configHubHint')}
      tabs={tabs}
      defaultTab={TAB_COMPANY}
    >
      {({ activeTab }) => {
        if (activeTab === TAB_COMPANY && isFullAccess) {
          return <SettingsEmbed organization={organization} lockTab="general" onUpdated={refreshOrganization} />;
        }
        if (activeTab === TAB_STRUCTURE && isFullAccess) {
          return (
            <SettingsEmbed organization={organization} lockTab="structure" onUpdated={refreshOrganization} />
          );
        }
        if (activeTab === TAB_RETENTION) {
          return <RetentionPolicyPanel orgId={orgId} embedded />;
        }
        return (
          <AdminComingSoonEmbed
            title={tabs.find((tab) => tab.id === activeTab)?.label || t('adminDomains.systemConfig.configHub')}
            hint={t('adminSystemConfig.tabComingSoonHint')}
          />
        );
      }}
    </AdminConfigTabsHubShell>
  );
}
