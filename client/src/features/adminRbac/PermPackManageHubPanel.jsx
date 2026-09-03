import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import useRbacRolelessAssignments from '../../hooks/useRbacRolelessAssignments';
import AdminRbacOpsHubShell from '../../components/admin/AdminRbacOpsHubShell';
import AdminRolePicker from '../../components/adminRbac/AdminRolePicker';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
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
  const userId = String(searchParams.get('userId') || '').trim();
  const needsRbacPicker = activeTab === TAB_ASSIGN || activeTab === TAB_REVOKE;
  const { assignmentsByUser, assignmentsReady, reloadAssignments } = useRbacRolelessAssignments(orgId, {
    enabled: needsRbacPicker,
  });

  const rbacPickerProps = useMemo(
    () => ({
      pageSize: 10,
      showRbacRoleFilter: true,
      rbacAssignments: { byUser: assignmentsByUser, ready: assignmentsReady },
    }),
    [assignmentsByUser, assignmentsReady]
  );

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
            hint={t('adminRbac.permPackPickerHint')}
            emptyLabel={t('adminUsers.noUsers')}
            {...rbacPickerProps}
          />
        );
      }
      return (
        <AdminUserPicker orgId={orgId} hint={t('adminRbac.revokePickerHint')} {...rbacPickerProps} />
      );
    },
    [orgId, t, rbacPickerProps]
  );

  const panelKey = `${orgId || ''}:${userId || 'none'}`;

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
            <RoleAssignPanel key={`assign-${panelKey}`} orgId={orgId} embedded onAssigned={reloadAssignments} />
          ) : null}
          {tab === TAB_REVOKE ? <RoleRevokePanel key={`revoke-${panelKey}`} orgId={orgId} embedded /> : null}
          {tab === TAB_DELETE ? <RoleDeletePanel orgId={orgId} embedded /> : null}
        </>
      )}
    </AdminRbacOpsHubShell>
  );
}
