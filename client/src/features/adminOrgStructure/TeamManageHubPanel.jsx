import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminOrgUnitOpsHubShell from '../../components/admin/AdminOrgUnitOpsHubShell';
import { adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import TeamEditPanel from './TeamEditPanel';
import TeamArchivePanel from './TeamArchivePanel';
import TeamMembersPanel from './TeamMembersPanel';
import TeamLeaderPanel from './TeamLeaderPanel';
import TeamDeptPanel from './TeamDeptPanel';

const TAB_EDIT = 'edit';
const TAB_ARCHIVE = 'archive';
const TAB_MEMBERS = 'members';
const TAB_LEADER = 'leader';
const TAB_DEPT = 'department';

export default function TeamManageHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const { teams, loading, error, loadStructure } = useAdminOrgStructure(orgId, {
    includeInactive: true,
  });

  const tabs = useMemo(
    () => [
      { id: TAB_EDIT, label: t('adminDomains.orgStructure.teamEdit') },
      { id: TAB_ARCHIVE, label: t('adminDomains.orgStructure.teamArchive') },
      { id: TAB_MEMBERS, label: t('adminDomains.orgStructure.teamMembers') },
      { id: TAB_LEADER, label: t('adminDomains.orgStructure.teamLeader') },
      { id: TAB_DEPT, label: t('adminDomains.orgStructure.teamDept') },
    ],
    [t]
  );

  return (
    <AdminOrgUnitOpsHubShell
      title={t('adminDomains.orgStructure.teamManageHub')}
      hint={t('adminOrg.teamManageHubHint')}
      tabs={tabs}
      defaultTab={TAB_EDIT}
      items={teams}
      loading={loading}
      error={error}
      onRetry={() => loadStructure()}
      pickerHint={t('adminOrg.teamEditPickerHint')}
      subtitleFn={(row) => row.departmentName || ''}
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
          {activeTab === TAB_EDIT ? <TeamEditPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_ARCHIVE ? <TeamArchivePanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_MEMBERS ? <TeamMembersPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_LEADER ? <TeamLeaderPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DEPT ? <TeamDeptPanel orgId={orgId} embedded /> : null}
        </div>
      )}
    </AdminOrgUnitOpsHubShell>
  );
}
