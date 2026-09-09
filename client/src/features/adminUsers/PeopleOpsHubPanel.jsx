import { useCallback, useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminEntityOpsHubShell from '../../components/admin/AdminEntityOpsHubShell';
import UserEditPanel from './UserEditPanel';
import UserAssignOrgPanel from './UserAssignOrgPanel';
import UserDeletePanel from './UserDeletePanel';
import { memberEmail, memberIsUnplaced } from '../../utils/adminUserUtils';

const TAB_EDIT = 'edit';
const TAB_ASSIGN = 'assign-org';
const TAB_DELETE = 'delete';

export default function PeopleOpsHubPanel({ orgId }) {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [
      { id: TAB_EDIT, label: t('adminDomains.users.edit') },
      { id: TAB_ASSIGN, label: t('adminDomains.users.assignOrg') },
      { id: TAB_DELETE, label: t('adminDomains.users.delete') },
    ],
    [t]
  );

  const unplacedFilter = useCallback((m) => memberIsUnplaced(m), []);

  const getPickerProps = useCallback(
    (activeTab) => {
      if (activeTab === TAB_ASSIGN) {
        return {
          pickerHint: t('adminUsers.assignOrgPickerHint'),
          pickerFilterFn: unplacedFilter,
          pickerEmptyLabel: t('adminUsers.assignOrgNoUnplaced'),
          pickerSubtitleFn: (m) => `${memberEmail(m)} · ${t('adminOrg.deptTransferUnassignedBadge')}`,
        };
      }
      if (activeTab === TAB_DELETE) {
        return { pickerHint: t('adminUsers.deletePickerHint') };
      }
      return { pickerHint: t('adminUsers.editPickerHint') };
    },
    [t, unplacedFilter]
  );

  return (
    <AdminEntityOpsHubShell
      title={t('adminDomains.users.peopleOpsHub')}
      hint={t('adminUsers.peopleOpsHubHint')}
      orgId={orgId}
      tabs={tabs}
      defaultTab={TAB_EDIT}
      pickerHint={t('adminUsers.editPickerHint')}
      getPickerProps={getPickerProps}
    >
      {({ activeTab }) => (
        <>
          {activeTab === TAB_EDIT ? <UserEditPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_ASSIGN ? <UserAssignOrgPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_DELETE ? <UserDeletePanel orgId={orgId} embedded /> : null}
        </>
      )}
    </AdminEntityOpsHubShell>
  );
}
