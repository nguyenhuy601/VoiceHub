import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { queryKeys } from '../../../lib/queryKeys';
import { ensureProjectHubRoleCatalog } from './useProjectHubQueries';
import { PROJECT_ROLE_PERMISSION_GROUPS } from './projectRolePermissionGroups';
import {
  labelProjectPermGroup,
  labelProjectPermission,
} from './projectRolePermissionLabels';
import { isSodLockedPermission, sodLockedPermissionSet } from './projectRoleSodLocks';
import PermissionDomainCardBrowser from '../../adminRbac/PermissionDomainCardBrowser';
import { localizedProjectRoleShortLabel } from '../../../utils/projectRoleLocale';

/**
 * Matrix quyền Project Role theo dự án (share cache với Members/staffing).
 */
export default function ProjectHubRoleMatrixSection({
  projectId,
  t,
  muted,
  fieldLabelCls,
  inputCls,
  /** project:roles — false = chỉ xem (Admin catalog vẫn ở /app/admin/rbac/project-roles). */
  canEdit = true,
}) {
  const queryClient = useQueryClient();
  const pid = String(projectId || '').trim();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedPerms, setSelectedPerms] = useState(() => new Set());
  const [permGroupKey, setPermGroupKey] = useState(() => PROJECT_ROLE_PERMISSION_GROUPS[0]?.id || '');
  const [permFilter, setPermFilter] = useState('');

  const load = useCallback(async () => {
    if (!pid) return;
    setLoading(true);
    try {
      const list = await ensureProjectHubRoleCatalog(queryClient, pid);
      setRoles(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('common.loadFail') }));
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [pid, queryClient, t]);

  useEffect(() => {
    load();
  }, [load]);

  const role = useMemo(
    () => roles.find((r) => String(r._id || r.id) === String(selectedRoleId)) || null,
    [roles, selectedRoleId]
  );

  useEffect(() => {
    if (!role) {
      setSelectedPerms(new Set());
      return;
    }
    setSelectedPerms(new Set(Array.isArray(role.permissions) ? role.permissions.map(String) : []));
  }, [role]);

  useEffect(() => {
    if (!selectedRoleId && roles.length) {
      setSelectedRoleId(String(roles[0]._id || roles[0].id || ''));
    }
  }, [roles, selectedRoleId]);

  const togglePerm = (key) => {
    if (isSodLockedPermission(role?.key, key)) return;
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredPermGroups = useMemo(() => {
    const q = permFilter.trim().toLowerCase();
    return PROJECT_ROLE_PERMISSION_GROUPS.map((group) => {
      const groupLabel = labelProjectPermGroup(group.id, t);
      const keys = group.keys.filter((key) => {
        if (!q) return true;
        const permLabel = labelProjectPermission(key, t);
        return (
          key.toLowerCase().includes(q) ||
          permLabel.toLowerCase().includes(q) ||
          groupLabel.toLowerCase().includes(q)
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

  const save = async () => {
    if (!canEdit || !pid || !role || busy) return;
    const roleId = String(role._id || role.id || '');
    if (!roleId) return;
    setBusy(true);
    try {
      const locked = sodLockedPermissionSet(role.key);
      const permissions = [...new Set([...selectedPerms, ...locked])];
      const res = await projectAPI.updateProjectScopedRole(pid, roleId, {
        permissions,
      });
      const saved = res?.data?.data || res?.data || {};
      const savedPerms = Array.isArray(saved.permissions) ? saved.permissions.map(String) : [];
      setSelectedPerms(new Set(savedPerms));
      queryClient.setQueryData(queryKeys.projectHub.roleCatalog(pid), (prev) => {
        const list = Array.isArray(prev) ? prev : roles;
        return list.map((r) =>
          String(r._id || r.id) === roleId ? { ...r, ...saved, permissions: savedPerms } : r
        );
      });
      setRoles((prev) =>
        prev.map((r) =>
          String(r._id || r.id) === roleId ? { ...r, ...saved, permissions: savedPerms } : r
        )
      );
      toast.success(t('common.saveSuccess'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('common.saveFail') }));
    } finally {
      setBusy(false);
    }
  };

  const resetDefault = async () => {
    if (!canEdit || !pid || !role || busy) return;
    const roleId = String(role._id || role.id || '');
    if (!roleId) return;
    setBusy(true);
    try {
      const res = await projectAPI.resetProjectScopedRoleDefault(pid, roleId);
      const saved = res?.data?.data || res?.data || {};
      const savedPerms = Array.isArray(saved.permissions) ? saved.permissions.map(String) : [];
      setSelectedPerms(new Set(savedPerms));
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.roleCatalog(pid) });
      await load();
      toast.success(t('workspace.projectHubRoleMatrixResetOk'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('common.saveFail') }));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !roles.length) {
    return <p className={`text-sm ${muted}`}>{t('common.loading')}</p>;
  }

  if (!roles.length) {
    return <p className={`text-sm ${muted}`}>{t('workspace.projectHubRoleMatrixEmpty')}</p>;
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className={fieldLabelCls}>{t('workspace.projectHubRoleMatrixPickRole')}</span>
        <select
          className={inputCls}
          value={selectedRoleId}
          onChange={(e) => setSelectedRoleId(e.target.value)}
        >
          {roles.map((r) => {
            const id = String(r._id || r.id || '');
            return (
              <option key={id} value={id}>
                {localizedProjectRoleShortLabel(r.key, r.label, t)} ({r.key})
              </option>
            );
          })}
        </select>
      </label>

      {role ? (
        <>
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
                          sodLocked || !canEdit
                            ? 'cursor-not-allowed opacity-80'
                            : on
                              ? 'cursor-pointer bg-primary-subtle/40'
                              : 'cursor-pointer hover:bg-muted/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!canEdit || busy || sodLocked}
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
                            {t('workspace.projectHubRoleMatrixSodLocked')}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </PermissionDomainCardBrowser>

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {busy ? t('common.saving') : t('common.save')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={resetDefault}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {t('workspace.projectHubRoleMatrixReset')}
              </button>
            </div>
          ) : (
            <p className={`text-xs ${muted}`}>{t('workspace.projectHubRoleMatrixDenied')}</p>
          )}
        </>
      ) : null}
    </div>
  );
}
