import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  adminInputClass,
  adminPrimaryBtnClass,
  adminDangerBtnClass,
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
import {
  applyOrgRoleBulk,
  nextKeysForRemove,
  nextKeysForReplace,
  uniqueRoleKeys,
} from './orgRoleAssignmentBulk';
import { canonicalizeOrgRoleLabel } from '../../utils/effectiveOrgRoleLabel';
import { filterOrgRoleCatalogRows } from '../../utils/orgRoleLocale';

function assignmentRows(res) {
  return res?.data?.assignments || res?.data?.data?.assignments || [];
}

function RoleSelect({ label, value, onChange, roles, placeholder, t }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <select className={adminInputClass()} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {roles.map((role) => (
          <option key={role._id || role.id || role.key} value={role.key}>
            {canonicalizeOrgRoleLabel(role.key || role.code, role.label || role.name, t) || role.key}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Sửa (đổi một vai trò) hoặc gỡ vai trò cho nhiều nhân sự đã chọn.
 * @param {{ orgId: string, selectedUserIds?: string[], mode: 'replace' | 'remove' }} props
 */
export default function OrgRolePeopleBulkPanel({ orgId, selectedUserIds = [], mode }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const clickedUserId = String(searchParams.get('userId') || '').trim();
  const checkedIds = uniqueRoleKeys(selectedUserIds);
  const userIds = checkedIds.length ? checkedIds : clickedUserId ? [clickedUserId] : [];
  const replaceMode = mode === 'replace';

  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [roles, setRoles] = useState([]);
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadCatalog = async () => {
    if (!orgId) return;
    setLoading(true);
    setCatalogError('');
    try {
      const res = await orgRoleCatalogAPI.listCatalog(orgId);
      setRoles(filterOrgRoleCatalogRows(res?.data?.roles || res?.data?.data?.roles || []));
    } catch (error) {
      setCatalogError(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, [orgId]);

  const roleLabel = (key) => roles.find((role) => role.key === key)?.label || key;
  const ready = replaceMode
    ? Boolean(userIds.length && fromKey && toKey && fromKey !== toKey)
    : Boolean(userIds.length && fromKey);

  const apply = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const { changed, skipped } = await applyOrgRoleBulk({
        userIds,
        nextKeysForUser: (current) =>
          replaceMode
            ? nextKeysForReplace(current, fromKey, toKey)
            : nextKeysForRemove(current, fromKey),
        listRows: async () => assignmentRows(await orgRoleCatalogAPI.listAssignments(orgId)),
        saveKeys: (userId, roleKeys) => orgRoleCatalogAPI.setAssignments(orgId, userId, roleKeys),
      });
      if (!changed) {
        toast.error(t('adminRbac.orgRoleBulkNoneChanged'));
        return;
      }
      toast.success(
        t(replaceMode ? 'adminRbac.orgRoleBulkReplaceDone' : 'adminRbac.orgRoleBulkRemoveDone', {
          count: changed,
        })
      );
      if (skipped) toast(t('adminRbac.orgRoleBulkSkipped', { count: skipped }));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.saveFail') }));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const title = replaceMode
    ? t('adminDomains.rbac.orgRoleEdit')
    : t('adminDomains.rbac.orgRoleDelete');

  return (
    <>
      <AdminUserFormCard title={title}>
        {loading && !roles.length ? (
          <AdminListSkeleton rows={3} />
        ) : catalogError ? (
          <AdminLoadErrorState message={catalogError} onRetry={() => loadCatalog()} />
        ) : !roles.length ? (
          <AdminEmptyState message={t('adminRbac.orgRoleCatalogEmpty')} />
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {userIds.length
                ? t('adminRbac.orgRoleBulkSelected', { count: userIds.length })
                : t('adminRbac.orgRoleSelectUsersFirst')}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              {replaceMode ? t('adminRbac.orgRolePeopleEditHint') : t('adminRbac.orgRolePeopleDeleteHint')}
            </p>
            <RoleSelect
              label={replaceMode ? t('adminRbac.orgRoleReplaceFrom') : t('adminRbac.roleLabelField')}
              value={fromKey}
              onChange={setFromKey}
              roles={roles}
              placeholder={`-- ${t('adminRbac.selectRole')} --`}
              t={t}
            />
            {replaceMode ? (
              <RoleSelect
                label={t('adminRbac.orgRoleReplaceTo')}
                value={toKey}
                onChange={setToKey}
                roles={roles.filter((role) => role.key !== fromKey)}
                placeholder={`-- ${t('adminRbac.selectRole')} --`}
                t={t}
              />
            ) : null}
            <button
              type="button"
              disabled={!ready || busy}
              aria-busy={busy || undefined}
              className={replaceMode ? adminPrimaryBtnClass() : adminDangerBtnClass()}
              onClick={() => setConfirmOpen(true)}
            >
              <AdminBusySpinner busy={busy} />
              {busy
                ? t('common.saving')
                : replaceMode
                  ? t('adminRbac.orgRoleBulkReplaceAction')
                  : t('adminRbac.orgRoleBulkRemoveAction')}
            </button>
          </>
        )}
      </AdminUserFormCard>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={apply}
        variant={replaceMode ? 'default' : 'danger'}
        title={t(
          replaceMode ? 'adminRbac.orgRoleBulkReplaceConfirmTitle' : 'adminRbac.orgRoleBulkRemoveConfirmTitle'
        )}
        message={t(
          replaceMode
            ? 'adminRbac.orgRoleBulkReplaceConfirmMessage'
            : 'adminRbac.orgRoleBulkRemoveConfirmMessage',
          {
            from: roleLabel(fromKey),
            to: roleLabel(toKey),
            role: roleLabel(fromKey),
            count: userIds.length,
          }
        )}
        confirmText={
          replaceMode ? t('adminRbac.orgRoleBulkReplaceAction') : t('adminRbac.orgRoleBulkRemoveAction')
        }
        cancelText={t('common.cancel')}
      />
    </>
  );
}
