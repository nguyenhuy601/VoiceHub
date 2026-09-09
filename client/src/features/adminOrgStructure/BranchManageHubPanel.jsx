import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminOrgUnitOpsHubShell from '../../components/admin/AdminOrgUnitOpsHubShell';
import { adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
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
          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2">
              <p className="text-sm text-destructive">{error}</p>
              <button
                type="button"
                className={`${adminPrimaryBtnClass()} mt-3`}
                onClick={() => loadStructure()}
              >
                {t('adminRbac.retry')}
              </button>
            </div>
          ) : null}
          {activeTab === TAB_EDIT ? <BranchEditPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DISABLE ? <BranchDisablePanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DEPT ? <BranchDeptPanel orgId={orgId} embedded /> : null}
        </div>
      )}
    </AdminOrgUnitOpsHubShell>
  );
}
