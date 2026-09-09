import { useCallback, useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminRbacOpsHubShell from '../../components/admin/AdminRbacOpsHubShell';
import AdminOrgRolePicker from '../../components/adminRbac/AdminOrgRolePicker';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import OrgRoleEditPanel from './OrgRoleEditPanel';
import OrgRoleAssignPanel from './OrgRoleAssignPanel';
import OrgRoleDeletePanel from './OrgRoleDeletePanel';

const TAB_EDIT = 'edit';
const TAB_ASSIGN = 'assign';
const TAB_DELETE = 'delete';

export default function OrgRoleManageHubPanel({ orgId }) {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [
      { id: TAB_EDIT, label: t('adminDomains.rbac.orgRoleEdit') },
      { id: TAB_ASSIGN, label: t('adminDomains.rbac.orgRoleAssign') },
      { id: TAB_DELETE, label: t('adminDomains.rbac.orgRoleDelete') },
    ],
    [t]
  );

  const renderPicker = useCallback(
    (activeTab) => {
      if (activeTab === TAB_ASSIGN) {
        return <AdminUserPicker orgId={orgId} hint={t('adminRbac.orgRoleAssignPickerHint')} />;
      }
      return <AdminOrgRolePicker orgId={orgId} hint={t('adminRbac.orgRolePickerHint')} />;
    },
    [orgId, t]
  );

  return (
    <AdminRbacOpsHubShell
      title={t('adminDomains.rbac.orgRoleManageHub')}
      hint={t('adminRbac.orgRoleManageHubHint')}
      tabs={tabs}
      defaultTab={TAB_EDIT}
      renderPicker={renderPicker}
    >
      {({ activeTab }) => (
        <>
          {activeTab === TAB_EDIT ? <OrgRoleEditPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_ASSIGN ? <OrgRoleAssignPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DELETE ? <OrgRoleDeletePanel orgId={orgId} embedded /> : null}
        </>
      )}
    </AdminRbacOpsHubShell>
  );
}
