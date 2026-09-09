import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { queryKeys } from '../../../lib/queryKeys';
import { ensureProjectHubRoleCatalog } from './useProjectHubQueries';
import { PROJECT_ROLE_PERMISSION_GROUPS } from './projectRolePermissionGroups';

function shortRoleLabel(label, key = '') {
  const raw = String(label || key || '').trim();
  if (!raw) return key || '—';
  return raw.replace(/^(Dự án|Project)\s*[—–\-:]\s*/i, '').trim() || raw;
}

/**
 * Matrix quyền Project Role theo dự án (share cache với Members/staffing).
 */
export default function ProjectHubRoleMatrixSection({
  projectId,
  t,
  muted,
  fieldLabelCls,
  inputCls,
}) {
  const queryClient = useQueryClient();
  const pid = String(projectId || '').trim();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedPerms, setSelectedPerms] = useState(() => new Set());

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
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    if (!pid || !role || busy) return;
    const roleId = String(role._id || role.id || '');
    if (!roleId) return;
    setBusy(true);
    try {
      const res = await projectAPI.updateProjectScopedRole(pid, roleId, {
        permissions: [...selectedPerms],
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
    if (!pid || !role || busy) return;
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
      <p className={`text-xs leading-relaxed ${muted}`}>{t('workspace.projectHubRoleMatrixHint')}</p>

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
                {shortRoleLabel(r.label, r.key)} ({r.key})
              </option>
            );
          })}
        </select>
      </label>

      {role ? (
        <>
          <div className="max-h-[22rem] space-y-3 overflow-auto rounded-lg border border-border/80 bg-background/40 p-2.5 pr-1">
            {PROJECT_ROLE_PERMISSION_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </p>
                <ul className="space-y-1">
                  {group.keys.map((key) => (
                    <li key={key}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-2 py-1.5 text-sm hover:bg-muted/40">
                        <input
                          type="checkbox"
                          checked={selectedPerms.has(key)}
                          onChange={() => togglePerm(key)}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        <span className="font-mono text-xs">{key}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('common.save')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={resetDefault}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              {t('workspace.projectHubRoleMatrixReset')}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
