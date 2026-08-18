import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import useRbacRolelessAssignments from '../../hooks/useRbacRolelessAssignments';
import AdminRbacOpsHubShell from '../../components/admin/AdminRbacOpsHubShell';
import AdminRolePicker from '../../components/adminRbac/AdminRolePicker';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { memberEmail } from '../../utils/adminUserUtils';
import RoleAssignPanel from './RoleAssignPanel';
import RoleRevokePanel from './RoleRevokePanel';
import RoleDeletePanel from './RoleDeletePanel';

const TAB_ASSIGN = 'assign';
const TAB_REVOKE = 'revoke';
const TAB_DELETE = 'delete';
const TAB_IDS = [TAB_ASSIGN, TAB_REVOKE, TAB_DELETE];

export default function PermPackManageHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const tabFromUrl = String(searchParams.get('tab') || '').trim();
  const activeTab = TAB_IDS.includes(tabFromUrl) ? tabFromUrl : TAB_ASSIGN;
  const { rolelessFilter, reloadAssignments } = useRbacRolelessAssignments(orgId, {
    enabled: activeTab === TAB_ASSIGN,
  });

  const tabs = useMemo(
    () => [
      { id: TAB_ASSIGN, label: t('adminDomains.rbac.assign') },
      { id: TAB_REVOKE, label: t('adminDomains.rbac.revoke') },
      { id: TAB_DELETE, label: t('adminDomains.rbac.delete') },
    ],
    [t]
  );

  const hubHint =
    activeTab === TAB_DELETE
      ? t('adminRbac.permPackManageHubHintDelete')
      : t('adminRbac.permPackManageHubHint');

  const renderPicker = useCallback(
    (tab) => {
      if (tab === TAB_DELETE) {
        return <AdminRolePicker orgId={orgId} hint={t('adminRbac.deletePickerHint')} />;
      }
      if (tab === TAB_ASSIGN) {
        return (
          <AdminUserPicker
            orgId={orgId}
            hint={t('adminRbac.assignPickerHint')}
            filterFn={rolelessFilter}
            emptyLabel={t('adminRbac.assignNoRoleless')}
            subtitleFn={(m) => `${memberEmail(m)} · ${t('adminRbac.assignRolelessBadge')}`}
          />
        );
      }
      return <AdminUserPicker orgId={orgId} hint={t('adminRbac.revokePickerHint')} />;
    },
    [orgId, t, rolelessFilter]
  );

  return (
    <AdminRbacOpsHubShell
      title={t('adminDomains.rbac.permPackManageHub')}
      hint={hubHint}
      tabs={tabs}
      defaultTab={TAB_ASSIGN}
      renderPicker={renderPicker}
    >
      {({ activeTab: tab }) => (
        <>
          {tab === TAB_ASSIGN ? (
            <RoleAssignPanel orgId={orgId} embedded onAssigned={reloadAssignments} />
          ) : null}
          {tab === TAB_REVOKE ? <RoleRevokePanel orgId={orgId} embedded /> : null}
          {tab === TAB_DELETE ? <RoleDeletePanel orgId={orgId} embedded /> : null}
        </>
      )}
    </AdminRbacOpsHubShell>
  );
}
