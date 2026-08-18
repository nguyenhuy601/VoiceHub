import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminOrgUnitOpsHubShell from '../../components/admin/AdminOrgUnitOpsHubShell';
import { adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import DivisionEditPanel from './DivisionEditPanel';
import DivisionDisablePanel from './DivisionDisablePanel';
import DivisionDeptPanel from './DivisionDeptPanel';

const TAB_EDIT = 'edit';
const TAB_DISABLE = 'disable';
const TAB_DEPT = 'departments';

export default function DivisionManageHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const { divisions, loading, error, loadStructure } = useAdminOrgStructure(orgId, {
    includeInactive: true,
  });

  const tabs = useMemo(
    () => [
      { id: TAB_EDIT, label: t('adminDomains.orgStructure.divisionEdit') },
      { id: TAB_DISABLE, label: t('adminDomains.orgStructure.divisionDisable') },
      { id: TAB_DEPT, label: t('adminDomains.orgStructure.divisionDept') },
    ],
    [t]
  );

  return (
    <AdminOrgUnitOpsHubShell
      title={t('adminDomains.orgStructure.divisionManageHub')}
      hint={t('adminOrg.divisionManageHubHint')}
      tabs={tabs}
      defaultTab={TAB_EDIT}
      items={divisions}
      loading={loading}
      error={error}
      onRetry={() => loadStructure()}
      pickerHint={t('adminOrg.divisionEditPickerHint')}
      subtitleFn={(row) => row.branchName || ''}
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
          {activeTab === TAB_EDIT ? <DivisionEditPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DISABLE ? <DivisionDisablePanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DEPT ? <DivisionDeptPanel orgId={orgId} embedded /> : null}
        </div>
      )}
    </AdminOrgUnitOpsHubShell>
  );
}
