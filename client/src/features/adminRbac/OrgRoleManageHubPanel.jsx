import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import AdminRbacOpsHubShell from '../../components/Admin/AdminRbacOpsHubShell';
import AdminOrgRolePicker from '../../components/adminRbac/AdminOrgRolePicker';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import OrgRoleEditPanel from './OrgRoleEditPanel';
import OrgRoleAssignPanel from './OrgRoleAssignPanel';
import OrgRoleDeletePanel from './OrgRoleDeletePanel';
import OrgRolePeopleBulkPanel from './OrgRolePeopleBulkPanel';

const TAB_EDIT = 'edit';
const TAB_ASSIGN = 'assign';
const TAB_DELETE = 'delete';

export default function OrgRoleManageHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const roleId = String(searchParams.get('roleId') || '').trim();
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const tabs = useMemo(
    () => [
      { id: TAB_ASSIGN, label: t('adminDomains.rbac.orgRoleAssign') },
      { id: TAB_EDIT, label: t('adminDomains.rbac.orgRoleEdit') },
      { id: TAB_DELETE, label: t('adminDomains.rbac.orgRoleDelete') },
    ],
    [t]
  );

  const renderPicker = useCallback(
    (activeTab) => {
      const catalogRole = Boolean(roleId) && (activeTab === TAB_EDIT || activeTab === TAB_DELETE);
      if (catalogRole) {
        return <AdminOrgRolePicker orgId={orgId} hint={t('adminRbac.orgRolePickerHint')} />;
      }
      return (
        <AdminUserPicker
          orgId={orgId}
          selectionMode="multiple"
          scrollLoad
          selectedUserIds={selectedUserIds}
          onSelectedUserIdsChange={setSelectedUserIds}
          hint={t('adminRbac.orgRoleAssignPickerHint')}
        />
      );
    },
    [orgId, roleId, selectedUserIds, t]
  );

  return (
    <AdminRbacOpsHubShell
      title={t('adminDomains.rbac.orgRoleAssign')}
      hint={t('adminRbac.orgRoleManageHubHint')}
      tabs={tabs}
      defaultTab={TAB_ASSIGN}
      renderPicker={renderPicker}
    >
      {({ activeTab }) => {
        const catalogRole = Boolean(roleId) && (activeTab === TAB_EDIT || activeTab === TAB_DELETE);
        if (catalogRole && activeTab === TAB_EDIT) return <OrgRoleEditPanel orgId={orgId} embedded />;
        if (catalogRole && activeTab === TAB_DELETE) return <OrgRoleDeletePanel orgId={orgId} embedded />;
        if (activeTab === TAB_EDIT) {
          return <OrgRolePeopleBulkPanel orgId={orgId} mode="replace" selectedUserIds={selectedUserIds} />;
        }
        if (activeTab === TAB_DELETE) {
          return <OrgRolePeopleBulkPanel orgId={orgId} mode="remove" selectedUserIds={selectedUserIds} />;
        }
        return <OrgRoleAssignPanel orgId={orgId} embedded selectedUserIds={selectedUserIds} />;
      }}
    </AdminRbacOpsHubShell>
  );
}
