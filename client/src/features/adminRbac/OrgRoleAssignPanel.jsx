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

function unique(arr) {
  return [...new Set((arr || []).map((x) => String(x).trim()).filter(Boolean))];
}

export default function OrgRoleAssignPanel({ orgId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const userIdParam = useMemo(() => String(searchParams.get('userId') || '').trim(), [searchParams]);
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
      setRoles(list);

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
      const items = res?.data?.assignments || [];
      setAssignedRoleKeys(unique(items.map((x) => x.roleKey)));
    } catch (error) {
      setAssignmentsError(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
      setAssignedRoleKeys([]);
    }
  };

  useEffect(() => {
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    loadAssignmentsForUser(userIdParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, userIdParam]);

  const setUserAssignments = async (nextRoleKeys) => {
    if (!orgId) return;
    if (!userIdParam) return;
    setAssignBusy(true);
    try {
      await orgRoleCatalogAPI.setAssignments(orgId, userIdParam, nextRoleKeys);
      setAssignedRoleKeys(unique(nextRoleKeys));
      toast.success(t('common.saveSuccess'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.saveFail') }));
    } finally {
      setAssignBusy(false);
    }
  };

  const addRole = () => {
    if (!selectedRoleKey || !userIdParam) return;
    const next = unique([...assignedRoleKeys, selectedRoleKey]);
    setUserAssignments(next);
  };

  const removeRole = () => {
    if (!selectedRoleKey || !userIdParam) return;
    const next = assignedRoleKeys.filter((k) => String(k) !== String(selectedRoleKey));
    return setUserAssignments(next);
  };

  const selectedRole = roles.find((r) => r.key === selectedRoleKey) || null;
  const selectedRoleAssigned = assignedRoleKeys.includes(selectedRoleKey);

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.orgRoleAssign')}
      hint={t('adminRbac.orgRoleAssignHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userIdParam} hint={t('adminRbac.orgRoleAssignPickerHint')} />

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
                <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('adminRbac.roleLabelField')}</span>
                <select
                  className={adminInputClass()}
                  value={selectedRoleKey}
                  onChange={(e) => setSelectedRoleKey(e.target.value)}
                >
                  <option value="">-- {t('adminRbac.selectRole')} --</option>
                  {roles.map((r) => (
                    <option key={r._id || r.id} value={r.key}>
                      {r.label || r.key}
                    </option>
                  ))}
                </select>
              </label>

              {assignmentsError ? (
                <AdminLoadErrorState
                  className="mb-3"
                  message={assignmentsError}
                  onRetry={() => loadAssignmentsForUser(userIdParam)}
                />
              ) : (
                <div className="mb-3 rounded-lg border border-border bg-muted p-3 text-sm">
                  <div className="font-medium text-foreground">{t('adminRbac.orgRoleCurrentRoles')}</div>
                  <div className="mt-1 text-muted-foreground">
                    {userIdParam
                      ? assignedRoleKeys.length
                        ? assignedRoleKeys.join(', ')
                        : t('adminUsers.taxonomyNone')
                      : t('adminUsers.selectUserFirst')}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!userIdParam || !selectedRoleKey || assignBusy}
                  aria-busy={assignBusy || undefined}
                  className={adminPrimaryBtnClass()}
                  onClick={addRole}
                >
                  <AdminBusySpinner busy={assignBusy} />
                  {assignBusy ? t('common.saving') : t('adminDomains.rbac.orgRoleAssign')}
                </button>
                <button
                  type="button"
                  disabled={!userIdParam || !selectedRoleKey || !selectedRoleAssigned || assignBusy}
                  className={adminDangerBtnClass()}
                  onClick={() => setConfirmRevoke(true)}
                >
                  {t('adminRbac.orgRoleRevoke')}
                </button>
              </div>

              <div className="mt-4">
                <button type="button" className={adminSecondaryBtnClass()} disabled={assignBusy} onClick={() => navigate('/app/admin/rbac/org-roles/directory')}>
                  {t('adminDomains.rbac.orgRoleDirectory')}
                </button>
              </div>
            </>
          )}
        </AdminUserFormCard>
      </div>
      <ConfirmDialog
        isOpen={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={removeRole}
        variant="danger"
        title={t('adminRbac.orgRoleRevokeConfirmTitle')}
        message={t('adminRbac.orgRoleRevokeConfirmMessage', {
          role: selectedRole?.label || selectedRoleKey,
        })}
        confirmText={t('adminRbac.orgRoleRevoke')}
        cancelText={t('common.cancel')}
      />
    </AdminUserPanelShell>
  );
}
