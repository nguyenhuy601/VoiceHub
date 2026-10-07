import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import AdminConfigTabsHubShell from '../../components/Admin/AdminConfigTabsHubShell';
import { adminSecondaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import OrganizationSettingsPanel from '../../components/Organization/OrganizationSettingsPanel';
import RetentionPolicyPanel from '../adminTasks/RetentionPolicyPanel';
import { useCompanyAdminContext } from '../../pages/Admin/CompanyAdminLayout';

const TAB_COMPANY = 'company';
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

function NoAccessState() {
  const { t } = useAppStrings();
  return (
    <div role="status" className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
      <p className="text-sm text-muted-foreground">{t('adminDomains.noPermission')}</p>
      <Link to="/app/admin" className={adminSecondaryBtnClass('focus-visible:ring-offset-2')}>
        <ArrowLeft size={16} aria-hidden />
        {t('adminDomains.backToHub')}
      </Link>
    </div>
  );
}

export default function SystemConfigHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const { organization, isFullAccess, refreshOrganization } = useCompanyAdminContext();

  const tabs = useMemo(
    () => [
      { id: TAB_COMPANY, label: t('adminDomains.systemConfig.company') },
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
        if (activeTab === TAB_RETENTION) {
          return <RetentionPolicyPanel orgId={orgId} embedded />;
        }
        if (!isFullAccess) return <NoAccessState />;
        const lockTab = activeTab === TAB_STRUCTURE ? 'structure' : 'general';
        return <SettingsEmbed organization={organization} lockTab={lockTab} onUpdated={refreshOrganization} />;
      }}
    </AdminConfigTabsHubShell>
  );
}
