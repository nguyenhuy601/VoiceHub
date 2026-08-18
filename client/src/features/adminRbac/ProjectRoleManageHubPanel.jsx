import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminRbacOpsHubShell from '../../components/admin/AdminRbacOpsHubShell';
import AdminProjectRolePicker from '../../components/adminRbac/AdminProjectRolePicker';
import ProjectRoleEditPanel from './ProjectRoleEditPanel';
import ProjectRoleDeletePanel from './ProjectRoleDeletePanel';

const TAB_EDIT = 'edit';
const TAB_DELETE = 'delete';

export default function ProjectRoleManageHubPanel({ orgId }) {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [
      { id: TAB_EDIT, label: t('adminDomains.rbac.projectRoleEdit') },
      { id: TAB_DELETE, label: t('adminDomains.rbac.projectRoleDelete') },
    ],
    [t]
  );

  return (
    <AdminRbacOpsHubShell
      title={t('adminDomains.rbac.projectRoleManageHub')}
      hint={t('adminRbac.projectRoleManageHubHint')}
      tabs={tabs}
      defaultTab={TAB_EDIT}
      renderPicker={() => (
        <AdminProjectRolePicker orgId={orgId} hint={t('adminRbac.projectRolePickerHint')} />
      )}
    >
      {({ activeTab }) => (
        <>
          {activeTab === TAB_EDIT ? <ProjectRoleEditPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DELETE ? <ProjectRoleDeletePanel orgId={orgId} embedded /> : null}
        </>
      )}
    </AdminRbacOpsHubShell>
  );
}
