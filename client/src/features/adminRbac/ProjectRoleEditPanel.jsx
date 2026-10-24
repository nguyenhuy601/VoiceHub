import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { AdminBusySpinner, AdminListSkeleton } from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { projectRolesAPI } from '../../services/api/projectRolesAPI';
import {
  PROJECT_ROLE_LABEL_PREFIX,
  looksLikeOrgStructureForProjectRole,
  normalizeLayerLabel,
  splitLayerLabel,
} from '../../utils/roleLayerNaming';
import { PROJECT_ROLE_PERMISSION_GROUPS as PERMISSION_GROUPS } from '../projects/hub/projectRolePermissionGroups';
import {
  labelProjectPermGroup,
  labelProjectPermission,
} from '../projects/hub/projectRolePermissionLabels';
import { isSodLockedPermission, sodLockedPermissionSet } from '../projects/hub/projectRoleSodLocks';
import PermissionDomainCardBrowser from './PermissionDomainCardBrowser';
import { RBAC_GRANT } from '../../config/rbacUiGrantMap';
import { useAdminActionGate } from '../../hooks/useAdminActionGate';
import { localizedProjectRoleShortLabel } from '../../utils/projectRoleLocale';

function unwrapRoles(res) {
  const data = res?.data?.data || res?.data?.roles || res?.data || [];
  return Array.isArray(data) ? data : [];
}

export default function ProjectRoleEditPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const { can, assertOrToast } = useAdminActionGate(orgId);
  const canUpdateMaster = can(RBAC_GRANT.MASTER_DATA_UPDATE);
  const [searchParams, setSearchParams] = useSearchParams();
  const roleId = useMemo(() => String(searchParams.get('roleId') || '').trim(), [searchParams]);

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [suffix, setSuffix] = useState('');
  const [canAssign, setCanAssign] = useState(false);
  const [selectedPerms, setSelectedPerms] = useState(() => new Set());
  const [permGroupKey, setPermGroupKey] = useState(() => PERMISSION_GROUPS[0]?.id || '');
  const [permFilter, setPermFilter] = useState('');

  const role = useMemo(
    () => roles.find((r) => String(r._id || r.id) === roleId) || null,
    [roles, roleId]
  );

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await projectRolesAPI.listRoles(orgId);
      const list = unwrapRoles(res);
      setRoles(list);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId]);

  useEffect(() => {
    if (!role) {
      setSuffix('');
      setCanAssign(false);
      setSelectedPerms(new Set());
      return;
    }
    setSuffix(splitLayerLabel(role?.label || '', 'project').suffix || role?.label || '');
    setCanAssign(Boolean(role?.canAssign));
    setSelectedPerms(new Set(Array.isArray(role?.permissions) ? role.permissions.map(String) : []));
  }, [role]);

  const selectRole = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('roleId', String(id));
    else next.delete('roleId');
    setSearchParams(next, { replace: true });
  };

  const togglePerm = (key) => {
    if (isSodLockedPermission(role?.key, key)) return;
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async () => {
    if (!orgId || !roleId || !role || busy) return;
    if (!assertOrToast(RBAC_GRANT.MASTER_DATA_UPDATE)) return;
    setBusy(true);
    try {
      const locked = sodLockedPermissionSet(role.key);
      const body = {
        permissions: [...new Set([...selectedPerms, ...locked])],
      };
      if (!role.isSystem) {
        if (!suffix.trim()) {
          toast.error(t('adminRbac.projectRoleLabelRequired'));
          setBusy(false);
          return;
        }
        body.label = normalizeLayerLabel(suffix, 'project');
        body.canAssign = canAssign;
      }
      const res = await projectRolesAPI.updateRole(orgId, roleId, body);
      const saved = res?.data?.data || res?.data || res || {};
      const savedPerms = Array.isArray(saved.permissions)
        ? saved.permissions.map(String)
        : [];
      const missing = body.permissions.filter((k) => !savedPerms.includes(k));
      if (missing.length) {
        toast.error(t('adminRbac.projectRolePermNotSaved', { keys: missing.join(', ') }));
      } else {
        toast.success(t('common.saveSuccess'));
      }
      setSelectedPerms(new Set(savedPerms));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.saveFail') }));
    } finally {
      setBusy(false);
    }
  };

  const filteredPermGroups = useMemo(() => {
    const q = permFilter.trim().toLowerCase();
    return PERMISSION_GROUPS.map((group) => {
      const groupLabel = labelProjectPermGroup(group.id, t);
      const keys = group.keys.filter((key) => {
        if (!q) return true;
        const permLabel = labelProjectPermission(key, t);
        return (
          key.toLowerCase().includes(q) ||
          permLabel.toLowerCase().includes(q) ||
          groupLabel.toLowerCase().includes(q) ||
          String(group.title || '').toLowerCase().includes(q)
        );
      });
      return { ...group, label: groupLabel, keys };
    }).filter((group) => group.keys.length);
  }, [permFilter, t]);

  useEffect(() => {
    if (!filteredPermGroups.length) {
      setPermGroupKey('');
      return;
    }
    if (!filteredPermGroups.some((g) => g.id === permGroupKey)) {
      setPermGroupKey(filteredPermGroups[0].id);
    }
  }, [filteredPermGroups, permGroupKey]);

  const permCards = useMemo(
    () =>
      filteredPermGroups.map((group) => ({
        key: group.id,
        label: group.label || labelProjectPermGroup(group.id, t),
        total: group.keys.length,
        selected: group.keys.filter(
          (k) => selectedPerms.has(k) || isSodLockedPermission(role?.key, k)
        ).length,
      })),
    [filteredPermGroups, selectedPerms, role?.key, t]
  );

  const activePermGroup = useMemo(
    () => filteredPermGroups.find((g) => g.id === permGroupKey) || null,
    [filteredPermGroups, permGroupKey]
  );

  const editFormCard = (
    <AdminUserFormCard title={t('adminDomains.rbac.projectRoleEdit')}>
      {!roleId || !role ? (
        <p className="text-sm text-muted-foreground">{t('adminRbac.selectRoleFirst')}</p>
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="font-medium">
              {t('adminRbac.roleKeyField')}: {role.key}
            </div>
            {role.isSystem ? (
              <div className="mt-1 text-xs text-success">{t('adminRbac.systemBadge')}</div>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">{t('adminRbac.roleKeyImmutableHint')}</p>
          </div>

          <label className="mb-4 block">
            <span className={adminLabelClass()}>{t('adminRbac.roleLabelField')}</span>
            <div className="flex overflow-hidden rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
              <span className="shrink-0 border-r border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {PROJECT_ROLE_LABEL_PREFIX.trimEnd()}
              </span>
              <input
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-60"
                maxLength={120}
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                disabled={role.isSystem}
                placeholder={t('adminRbac.projectRoleLabelPlaceholder')}
              />
            </div>
            {suffix.trim() && looksLikeOrgStructureForProjectRole(suffix) ? (
              <p className="mt-1 text-xs text-warning">
                {t('adminRbac.projectRoleLooksLikeOrgHint')}
              </p>
            ) : null}
          </label>

          <label className="mb-4 flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-1 rounded border-border"
              checked={canAssign}
              onChange={(e) => setCanAssign(e.target.checked)}
              disabled={role.isSystem}
            />
            <span className="text-muted-foreground">{t('adminRbac.canAssignField')}</span>
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            {canUpdateMaster ? (
              <button
                type="button"
                disabled={busy}
                aria-busy={busy}
                className={adminPrimaryBtnClass()}
                onClick={submit}
              >
                <AdminBusySpinner busy={busy} />
                {busy ? t('common.saving') : t('common.save')}
              </button>
            ) : null}
            {!embedded ? (
              <button
                type="button"
                disabled={busy}
                className={adminSecondaryBtnClass()}
                onClick={() => navigate('/app/admin/rbac/project-roles')}
              >
                {t('common.cancel')}
              </button>
            ) : null}
          </div>
        </>
      )}
    </AdminUserFormCard>
  );

  const permissionMatrixCard = role ? (
    <AdminUserFormCard title={t('adminRbac.permissionMatrixTitle')}>
      <PermissionDomainCardBrowser
        domains={permCards}
        activeKey={permGroupKey}
        onSelect={setPermGroupKey}
        searchValue={permFilter}
        onSearchChange={setPermFilter}
        searchLabel={t('adminDomains.rbac.permissionSearch')}
        searchPlaceholder={t('adminDomains.rbac.permissionSearchPlaceholder')}
        navTitle={t('adminRbac.permissionMatrixGroupNav')}
        detailHeading={t('adminRbac.permissionMatrixDetailHeading')}
        pickHint={t('adminRbac.permissionMatrixGroupPick')}
        emptyNav={t('adminRbac.permissionMatrixGroupsEmpty')}
      >
        {activePermGroup ? (
          <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border bg-background/80">
            {activePermGroup.keys.map((key) => {
              const sodLocked = isSodLockedPermission(role?.key, key);
              const on = selectedPerms.has(key) || sodLocked;
              return (
                <li key={key}>
                  <label
                    className={`flex items-start gap-2.5 px-3 py-2.5 text-sm ${
                      sodLocked
                        ? 'cursor-not-allowed opacity-80'
                        : on
                          ? 'cursor-pointer bg-primary-subtle/40'
                          : 'cursor-pointer hover:bg-muted/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={sodLocked}
                      onChange={() => togglePerm(key)}
                      className="mt-0.5 h-4 w-4 rounded border-border accent-primary disabled:opacity-50"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">
                        {labelProjectPermission(key, t)}
                      </span>
                      <code className="mt-0.5 inline-block rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {key}
                      </code>
                    </span>
                    {sodLocked ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t('adminRbac.permissionMatrixSodLocked')}
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : null}
      </PermissionDomainCardBrowser>
    </AdminUserFormCard>
  ) : (
    <AdminUserFormCard title={t('adminRbac.permissionMatrixTitle')}>
      <p className="text-sm text-muted-foreground">{t('adminRbac.selectRoleFirst')}</p>
    </AdminUserFormCard>
  );

  const rolePickerCard = (
    <AdminUserFormCard title={t('adminRbac.editPickerHint')}>
      <ul className="max-h-[28rem] space-y-1 overflow-auto">
        {roles.map((r) => {
          const id = String(r._id || r.id || '');
          const active = id === roleId;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => selectRole(id)}
                aria-current={active ? 'true' : undefined}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                  active
                    ? 'border-primary/40 bg-primary-subtle font-semibold text-foreground'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <span className="block truncate">{localizedProjectRoleShortLabel(r.key, r.label, t)}</span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                  {r.key}
                  {r.isSystem ? ` · ${t('adminRbac.systemBadge')}` : ''}
                </span>
              </button>
            </li>
          );
        })}
        {!roles.length ? (
          <li className="text-xs text-muted-foreground">{t('adminRbac.projectRoleCatalogEmpty')}</li>
        ) : null}
      </ul>
    </AdminUserFormCard>
  );

  if (loading && !roles.length) {
    const loadingBody = <AdminListSkeleton />;
    if (embedded) return loadingBody;
    return (
      <AdminUserPanelShell title={t('adminDomains.rbac.projectRoleEdit')} wide>
        {loadingBody}
      </AdminUserPanelShell>
    );
  }

  if (embedded) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {editFormCard}
        {permissionMatrixCard}
      </div>
    );
  }

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.projectRoleEdit')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        {rolePickerCard}
        <div className="space-y-4">
          {editFormCard}
          {permissionMatrixCard}
        </div>
      </div>
    </AdminUserPanelShell>
  );
}
