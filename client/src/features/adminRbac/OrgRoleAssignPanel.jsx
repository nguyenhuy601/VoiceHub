import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminInputClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import ConfirmDialog from '../../components/Shared/ConfirmDialog';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';
import { canonicalizeOrgRoleLabel } from '../../utils/effectiveOrgRoleLabel';
import { filterOrgRoleCatalogRows } from '../../utils/orgRoleLocale';
import {
  applyOrgRoleBulk,
  nextKeysForAssign,
  nextKeysForRemove,
  uniqueRoleKeys,
} from './orgRoleAssignmentBulk';
import { useAdminActionGate } from '../../hooks/useAdminActionGate';
import { RBAC_GRANT } from '../../config/rbacUiGrantMap';

function assignmentRows(res) {
  return res?.data?.assignments || res?.data?.data?.assignments || [];
}

/**
 * Gán / gỡ Vai trò tổ chức (catalog) cho user — không phải gói quyền RBAC.
 * @param {{ orgId: string, embedded?: boolean, selectedUserIds?: string[] }} props
 */
export default function OrgRoleAssignPanel({ orgId, embedded = false, selectedUserIds }) {
  const { t } = useAppStrings();
  const { can, assertOrToast } = useAdminActionGate(orgId);
  const canAssignOrgRole = can(RBAC_GRANT.ORG_ROLE_UPDATE);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const userIdParam = useMemo(() => String(searchParams.get('userId') || '').trim(), [searchParams]);
  const selectionControlled = Array.isArray(selectedUserIds);
  const [localUserIds, setLocalUserIds] = useState([]);
  const checkedIds = selectionControlled ? uniqueRoleKeys(selectedUserIds) : localUserIds;
  const targetUserIds = checkedIds.length ? checkedIds : userIdParam ? [userIdParam] : [];
  const singleUserId = targetUserIds.length === 1 ? targetUserIds[0] : '';
  const roleIdParam = useMemo(() => String(searchParams.get('roleId') || '').trim(), [searchParams]);
  const roleKeyParam = useMemo(() => String(searchParams.get('roleKey') || '').trim(), [searchParams]);

  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [roles, setRoles] = useState([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState(roleKeyParam || '');
  const [assignBusy, setAssignBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const [assignedRoleKeys, setAssignedRoleKeys] = useState([]);
  const [assignmentsError, setAssignmentsError] = useState('');

  const loadCatalog = async () => {
    if (!orgId) return;
    setLoading(true);
    setCatalogError('');
    try {
      const res = await orgRoleCatalogAPI.listCatalog(orgId);
      const list = res?.data?.roles || [];
      setRoles(filterOrgRoleCatalogRows(list));

      if (!selectedRoleKey && roleIdParam) {
        const found = list.find((r) => String(r._id || r.id) === roleIdParam);
        if (found?.key) setSelectedRoleKey(found.key);
      }
    } catch (error) {
      setCatalogError(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAssignmentsForUser = async (uid) => {
    setAssignmentsError('');
    if (!orgId || !uid) {
      setAssignedRoleKeys([]);
      return;
    }
    try {
      const res = await orgRoleCatalogAPI.listAssignments(orgId, { userId: uid });
      const items = assignmentRows(res);
      setAssignedRoleKeys(uniqueRoleKeys(items.map((x) => x.roleKey)));
    } catch (error) {
      setAssignmentsError(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
      setAssignedRoleKeys([]);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, [orgId]);

  useEffect(() => {
    loadAssignmentsForUser(singleUserId);
  }, [orgId, singleUserId]);

  useEffect(() => {
    if (roleKeyParam) setSelectedRoleKey(roleKeyParam);
  }, [roleKeyParam]);

  const runBulk = async (nextKeysForUser, doneKey) => {
    if (!assertOrToast(RBAC_GRANT.ORG_ROLE_UPDATE)) return;
    if (!orgId || !targetUserIds.length || !selectedRoleKey) return;
    setAssignBusy(true);
    try {
      const { changed, skipped } = await applyOrgRoleBulk({
        userIds: targetUserIds,
        nextKeysForUser,
        listRows: async () => assignmentRows(await orgRoleCatalogAPI.listAssignments(orgId)),
        saveKeys: (userId, roleKeys) => orgRoleCatalogAPI.setAssignments(orgId, userId, roleKeys),
      });
      if (singleUserId) await loadAssignmentsForUser(singleUserId);
      if (!changed) {
        toast.error(t('adminRbac.orgRoleBulkNoneChanged'));
        return;
      }
      toast.success(t(doneKey, { count: changed }));
      if (skipped) toast(t('adminRbac.orgRoleBulkSkipped', { count: skipped }));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.saveFail') }));
    } finally {
      setAssignBusy(false);
      setConfirmRevoke(false);
    }
  };

  const addRole = () => {
    if (!selectedRoleKey || !targetUserIds.length) return;
    return runBulk((current) => nextKeysForAssign(current, selectedRoleKey), 'adminRbac.orgRoleBulkAssignDone');
  };

  const removeRole = () => {
    if (!selectedRoleKey || !targetUserIds.length) return;
    return runBulk((current) => nextKeysForRemove(current, selectedRoleKey), 'adminRbac.orgRoleBulkRemoveDone');
  };

  const selectedRole = roles.find((r) => r.key === selectedRoleKey) || null;
  const selectedRoleAssigned = Boolean(singleUserId) && assignedRoleKeys.includes(selectedRoleKey);
  const canRevoke = Boolean(targetUserIds.length && selectedRoleKey) && (targetUserIds.length > 1 || selectedRoleAssigned);

  const formCard = (
    <AdminUserFormCard title={t('adminDomains.rbac.orgRoleAssign')}>
      {loading && !roles.length ? (
        <AdminListSkeleton rows={3} />
      ) : catalogError ? (
        <AdminLoadErrorState message={catalogError} onRetry={() => loadCatalog()} />
      ) : !roles.length ? (
        <AdminEmptyState message={t('adminRbac.orgRoleCatalogEmpty')} />
      ) : (
        <>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('adminRbac.roleLabelField')}
            </span>
            <select
              className={adminInputClass()}
              value={selectedRoleKey}
              onChange={(e) => setSelectedRoleKey(e.target.value)}
            >
              <option value="">-- {t('adminRbac.selectRole')} --</option>
              {roles.map((r) => (
                <option key={r._id || r.id} value={r.key}>
                  {canonicalizeOrgRoleLabel(r.code || r.key, r.label || r.name || r.key, t)}
                </option>
              ))}
            </select>
          </label>

          {assignmentsError ? (
            <AdminLoadErrorState
              className="mb-3"
              message={assignmentsError}
              onRetry={() => loadAssignmentsForUser(singleUserId)}
            />
          ) : (
            <div className="mb-3 rounded-lg border border-border bg-muted p-3 text-sm">
              <div className="font-medium text-foreground">
                {targetUserIds.length > 1
                  ? t('adminRbac.orgRoleBulkSelected', { count: targetUserIds.length })
                  : t('adminRbac.orgRoleCurrentRoles')}
              </div>
              <div className="mt-1 text-muted-foreground">
                {targetUserIds.length > 1
                  ? t('adminRbac.orgRoleBulkAssignHint')
                  : singleUserId
                    ? assignedRoleKeys.length
                      ? assignedRoleKeys
                          .map((key) => {
                            const hit = roles.find((r) => r.key === key);
                            return hit?.label || key;
                          })
                          .join(', ')
                      : t('adminUsers.taxonomyNone')
                    : t('adminRbac.orgRoleSelectUsersFirst')}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canAssignOrgRole || !targetUserIds.length || !selectedRoleKey || assignBusy}
              aria-busy={assignBusy || undefined}
              className={adminPrimaryBtnClass()}
              onClick={addRole}
            >
              <AdminBusySpinner busy={assignBusy} />
              {assignBusy ? t('common.saving') : t('adminDomains.rbac.orgRoleAssign')}
            </button>
            <button
              type="button"
              disabled={!canAssignOrgRole || !canRevoke || assignBusy}
              className={adminDangerBtnClass()}
              onClick={() => setConfirmRevoke(true)}
            >
              {t('adminRbac.orgRoleRevoke')}
            </button>
          </div>

          <div className="mt-4">
            <button
              type="button"
              className={adminSecondaryBtnClass()}
              disabled={assignBusy}
              onClick={() => navigate('/app/admin/rbac/org-roles/directory')}
            >
              {t('adminDomains.rbac.orgRoleDirectory')}
            </button>
          </div>
        </>
      )}
    </AdminUserFormCard>
  );

  const dialog = (
    <ConfirmDialog
      isOpen={confirmRevoke}
      onClose={() => setConfirmRevoke(false)}
      onConfirm={removeRole}
      variant="danger"
      title={t('adminRbac.orgRoleRevokeConfirmTitle')}
      message={t('adminRbac.orgRoleRevokeConfirmMessage', {
        role: selectedRole?.label || selectedRoleKey,
        count: targetUserIds.length,
      })}
      confirmText={t('adminRbac.orgRoleRevoke')}
      cancelText={t('common.cancel')}
    />
  );

  if (embedded) {
    return (
      <>
        {formCard}
        {dialog}
      </>
    );
  }

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.orgRoleAssign')}
      hint={t('adminRbac.orgRoleAssignHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker
          orgId={orgId}
          selectionMode="multiple"
          scrollLoad
          selectedUserIds={targetUserIds}
          onSelectedUserIdsChange={setLocalUserIds}
          hint={t('adminRbac.orgRoleAssignPickerHint')}
        />
        {formCard}
      </div>
      {dialog}
    </AdminUserPanelShell>
  );
}
