import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminOrgUnitOpsHubShell from '../../components/Admin/AdminOrgUnitOpsHubShell';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import BranchEditPanel from './BranchEditPanel';
import BranchDisablePanel from './BranchDisablePanel';
import BranchDeptPanel from './BranchDeptPanel';

const TAB_EDIT = 'edit';
const TAB_DISABLE = 'disable';
const TAB_DEPT = 'departments';

export default function BranchManageHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const { branches, loading, error, loadStructure } = useAdminOrgStructure(orgId, {
    includeInactive: true,
  });

  const tabs = useMemo(
    () => [
      { id: TAB_EDIT, label: t('adminDomains.orgStructure.branchEdit') },
      { id: TAB_DISABLE, label: t('adminDomains.orgStructure.branchDisable') },
      { id: TAB_DEPT, label: t('adminDomains.orgStructure.branchDept') },
    ],
    [t]
  );

  return (
    <AdminOrgUnitOpsHubShell
      title={t('adminDomains.orgStructure.branchManageHub')}
      hint={t('adminOrg.branchManageHubHint')}
      tabs={tabs}
      defaultTab={TAB_EDIT}
      items={branches}
      loading={loading}
      error={error}
      onRetry={() => loadStructure()}
      pickerHint={t('adminOrg.branchEditPickerHint')}
      badgeFn={(row) => (row.isActive === false ? t('adminOrg.inactive') : t('adminOrg.active'))}
    >
      {({ activeTab }) => (
        <div className="space-y-4">
          {activeTab === TAB_EDIT ? <BranchEditPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DISABLE ? <BranchDisablePanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DEPT ? <BranchDeptPanel orgId={orgId} embedded /> : null}
        </div>
      )}
    </AdminOrgUnitOpsHubShell>
  );
}
