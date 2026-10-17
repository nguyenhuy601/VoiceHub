import { useCallback, useMemo, useState } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminRbacOpsHubShell from '../../components/Admin/AdminRbacOpsHubShell';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import PosAssignPanel from '../adminOrgStructure/PosAssignPanel';
import PosPeopleBulkPanel from '../adminOrgStructure/PosPeopleBulkPanel';

const TAB_ASSIGN = 'assign';
const TAB_EDIT = 'edit';
const TAB_DISABLE = 'disable';

export default function PosManageHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const tabs = useMemo(
    () => [
      { id: TAB_ASSIGN, label: t('adminDomains.rbac.posAssign') },
      { id: TAB_EDIT, label: t('adminDomains.rbac.posEdit') },
      { id: TAB_DISABLE, label: t('adminDomains.rbac.posDisable') },
    ],
    [t]
  );

  const renderPicker = useCallback(
    () => (
      <AdminUserPicker
        orgId={orgId}
        selectionMode="multiple"
        scrollLoad
        selectedUserIds={selectedUserIds}
        onSelectedUserIdsChange={setSelectedUserIds}
        hint={t('adminOrg.posAssignUserHint')}
      />
    ),
    [orgId, selectedUserIds, t]
  );

  return (
    <AdminRbacOpsHubShell
      title={t('adminDomains.rbac.posManageHub')}
      hint={t('adminOrg.posManageHubHint')}
      tabs={tabs}
      defaultTab={TAB_ASSIGN}
      renderPicker={renderPicker}
    >
      {({ activeTab }) => (
        <>
          {activeTab === TAB_ASSIGN ? (
            <PosAssignPanel orgId={orgId} embedded selectedUserIds={selectedUserIds} />
          ) : null}
          {activeTab === TAB_EDIT ? (
            <PosPeopleBulkPanel orgId={orgId} mode="replace" selectedUserIds={selectedUserIds} />
          ) : null}
          {activeTab === TAB_DISABLE ? (
            <PosPeopleBulkPanel orgId={orgId} mode="remove" selectedUserIds={selectedUserIds} />
          ) : null}
        </>
      )}
    </AdminRbacOpsHubShell>
  );
}
