import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminOrgUnitOpsHubShell from '../../components/admin/AdminOrgUnitOpsHubShell';
import { adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import DeptEditPanel from './DeptEditPanel';
import DeptDisablePanel from './DeptDisablePanel';
import DeptParentPanel from './DeptParentPanel';
import DeptHeadPanel from './DeptHeadPanel';
import DeptMembersPanel from './DeptMembersPanel';
import DeptOrgRolesPanel from './DeptOrgRolesPanel';
import DeptTransferPanel from './DeptTransferPanel';

const TAB_EDIT = 'edit';
const TAB_DISABLE = 'disable';
const TAB_PARENT = 'parent';
const TAB_HEAD = 'head';
const TAB_MEMBERS = 'members';
const TAB_ORG_ROLES = 'org-roles';
const TAB_TRANSFER = 'transfer';

export default function DeptManageHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const { departments, loading, error, loadStructure } = useAdminOrgStructure(orgId, {
    includeInactive: true,
  });

  const tabs = useMemo(
    () => [
      { id: TAB_EDIT, label: t('adminDomains.orgStructure.deptEdit') },
      { id: TAB_DISABLE, label: t('adminDomains.orgStructure.deptDisable') },
      { id: TAB_PARENT, label: t('adminDomains.orgStructure.deptParent') },
      { id: TAB_HEAD, label: t('adminDomains.orgStructure.deptHead') },
      { id: TAB_MEMBERS, label: t('adminDomains.orgStructure.deptMembers') },
      { id: TAB_ORG_ROLES, label: t('adminDomains.orgStructure.deptOrgRoles') },
      { id: TAB_TRANSFER, label: t('adminDomains.orgStructure.deptTransfer') },
    ],
    [t]
  );

  return (
    <AdminOrgUnitOpsHubShell
      title={t('adminDomains.orgStructure.deptManageHub')}
      hint={t('adminOrg.deptManageHubHint')}
      tabs={tabs}
      defaultTab={TAB_EDIT}
      items={departments}
      loading={loading}
      error={error}
      onRetry={() => loadStructure()}
      pickerHint={t('adminOrg.deptEditPickerHint')}
      subtitleFn={(row) => row.divisionName || row.branchName || ''}
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
          {activeTab === TAB_EDIT ? <DeptEditPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DISABLE ? <DeptDisablePanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_PARENT ? <DeptParentPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_HEAD ? <DeptHeadPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_MEMBERS ? <DeptMembersPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_ORG_ROLES ? <DeptOrgRolesPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_TRANSFER ? <DeptTransferPanel orgId={orgId} embedded /> : null}
        </div>
      )}
    </AdminOrgUnitOpsHubShell>
  );
}
