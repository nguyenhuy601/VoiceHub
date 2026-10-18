import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { AdminBusySpinner, AdminLoadErrorState } from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';
import { orgRbacAPI } from '../../services/api/orgRbacAPI';
import { roleAPI } from '../../services/api/roleAPI';
import { isScopeLessGrant } from '../../lib/capabilities';
import { unwrapCatalogPayload } from '../../utils/rbacUi';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

const SCOPE_VALUES = ['SELF', 'DEPARTMENT', 'ORGANIZATION', 'SYSTEM'];

/**
 * Step 2 — Gán Permission + Scope vào Organizational Role (role = gói quyền).
 */
export default function OrgRolePermissionMatrixPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [roles, setRoles] = useState([]);
  const [roleId, setRoleId] = useState(() => String(searchParams.get('roleId') || ''));
  const [groups, setGroups] = useState([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState({}); // code -> scope
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadRoles = useCallback(async () => {
    if (!orgId) return;
    const res = await orgRoleCatalogAPI.listCatalog(orgId);
    const list = res?.data?.roles || res?.data?.data?.roles || [];
    setRoles(Array.isArray(list) ? list : []);
  }, [orgId]);

  const loadSystem = useCallback(async () => {
    const res = await (roleAPI.listSystemPermissions || roleAPI.getRbacCatalog)();
    const payload = unwrapCatalogPayload(res);
    const tree = Array.isArray(payload?.tree) ? payload.tree : [];
    setGroups(
      tree
        .map((cat) => ({
          key: cat.key || cat.label,
          label: cat.label || cat.key,
          modules: (Array.isArray(cat.modules) ? cat.modules : [])
            .map((mod) => ({
              key: mod.key || mod.label,
              label: mod.label || mod.key,
              permissions: (Array.isArray(mod.permissions) ? mod.permissions : [])
                .map((p) => ({
                  key: String(p.key || p.code || '').trim(),
                  label: p.label || p.action || '',
                }))
                .filter((p) => p.key),
            }))
            .filter((mod) => mod.permissions.length),
        }))
        .filter((cat) => cat.modules.length)
    );
  }, []);

  const loadMatrix = useCallback(async (rid) => {
    if (!orgId || !rid) {
      setSelected({});
      return;
    }
    const res = await orgRbacAPI.getRolePermissions(orgId, rid);
    const perms = res?.data?.permissions || res?.data?.data?.permissions || [];
    const map = {};
    for (const p of perms) {
      const code = String(p.permissionCode || '').trim();
      if (code) map[code] = p.scopeType || 'ORGANIZATION';
    }
    setSelected(map);
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await Promise.all([loadRoles(), loadSystem()]);
      } catch (err) {
        if (!cancelled) {
          const msg = resolveApiErrorMessage(err, { t, fallback: t('common.loadFail') });
          setError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRoles, loadSystem, t]);

  useEffect(() => {
    if (!roleId) return;
    loadMatrix(roleId).catch((err) => {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('common.loadFail') }));
    });
  }, [roleId, loadMatrix, t]);

  const scopeLabel = (scope) => {
    if (scope === 'SELF') return t('adminDomains.rbac.scopeSelf');
    if (scope === 'DEPARTMENT') return t('adminDomains.rbac.scopeDepartment');
    if (scope === 'SYSTEM') return t('adminDomains.rbac.scopeSystem');
    return t('adminDomains.rbac.scopeOrganization');
  };

  const visibleGroups = useMemo(() => {
    const hidden = (key) => {
      const code = String(key || '');
      return code.startsWith('organization.branch.') || code.startsWith('organization.division.');
    };
    const withoutLegacy = groups
      .map((cat) => ({
        ...cat,
        modules: cat.modules
          .map((mod) => ({
            ...mod,
            permissions: mod.permissions.filter((p) => !hidden(p.key)),
          }))
          .filter((mod) => mod.permissions.length),
      }))
      .filter((cat) => cat.modules.length);
    const q = filter.trim().toLowerCase();
    if (!q) return withoutLegacy;
    return withoutLegacy
      .map((cat) => ({
        ...cat,
        modules: cat.modules
          .map((mod) => ({
            ...mod,
            permissions: mod.permissions.filter(
              (p) => p.key.toLowerCase().includes(q) || String(p.label).toLowerCase().includes(q)
            ),
          }))
          .filter((mod) => mod.permissions.length),
      }))
      .filter((cat) => cat.modules.length);
  }, [groups, filter]);

  const chooseRole = (nextId) => {
    setRoleId(nextId);
    const params = new URLSearchParams(searchParams);
    if (nextId) params.set('roleId', nextId);
    else params.delete('roleId');
    setSearchParams(params, { replace: true });
  };

  const roleOptions = useMemo(
    () =>
      roles.map((r) => {
        const code = String(r.code || r.key || '').toLowerCase();
        const raw = r.label || r.name || r.key || r.code;
        const name =
          code === 'member' || raw === 'Member'
            ? t('adminDomains.rbac.orgRoleMemberDefault')
            : raw;
        return {
          id: String(r._id || r.id),
          label: t('adminDomains.rbac.orgRoleSelectOptionLabel', { name }),
        };
      }),
    [roles, t]
  );

  const toggle = (code) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[code]) delete next[code];
      else next[code] = 'ORGANIZATION';
      return next;
    });
  };

  const setScope = (code, scope) => {
    setSelected((prev) => ({ ...prev, [code]: scope }));
  };

  const save = async () => {
    if (!orgId || !roleId || saving) return;
    setSaving(true);
    try {
      const permissions = Object.entries(selected).map(([permissionCode, scopeType]) => ({
        permissionCode,
        // API vẫn bắt scopeType; quyền tạo dự án không dùng giá trị này.
        scopeType: isScopeLessGrant(permissionCode) ? 'ORGANIZATION' : scopeType,
      }));
      await orgRbacAPI.putRolePermissions(orgId, roleId, permissions);
      toast.success(t('adminDomains.rbac.roleMatrixSaved'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('common.saveFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.orgRolePermissionMatrix')}
      hint={t('adminDomains.rbac.orgRolePermissionMatrixHint')}
    >
      {loading ? <AdminBusySpinner /> : null}
      {!loading && error ? <AdminLoadErrorState message={error} /> : null}
      {!loading && !error ? (
        <AdminUserFormCard title={t('adminDomains.rbac.sectionOrgRoles')}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>{t('adminDomains.rbac.selectOrgRole')}</span>
              <select
                className="min-w-[220px] rounded-md border border-border bg-background px-2 py-1.5"
                value={roleId}
                onChange={(e) => chooseRole(e.target.value)}
              >
                <option value="">—</option>
                {roleOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={adminPrimaryBtnClass()}
              disabled={!roleId || saving}
              onClick={save}
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
            <button type="button" className={adminSecondaryBtnClass()} onClick={() => loadMatrix(roleId)}>
              {t('common.reload')}
            </button>
          </div>
          {roleId ? (
            <>
              <label className="mt-4 flex flex-col gap-1 text-sm">
                <span>{t('adminDomains.rbac.permissionSearch')}</span>
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="max-w-md rounded-md border border-border bg-background px-2 py-1.5"
                />
              </label>
              <div className="mt-4 max-h-[560px] space-y-4 overflow-y-auto">
                {visibleGroups.map((cat) => (
                  <section key={cat.key}>
                    <h3 className="text-sm font-semibold text-foreground">{cat.label}</h3>
                    {cat.modules.map((mod) => (
                      <div key={mod.key} className="mt-2">
                        <div className="text-xs font-medium text-muted-foreground">{mod.label}</div>
                        <ul className="mt-1 space-y-1">
                          {mod.permissions.map((perm) => {
                            const on = Boolean(selected[perm.key]);
                            const scopeLess = isScopeLessGrant(perm.key);
                            return (
                              <li key={perm.key} className="flex flex-wrap items-center gap-2 border-b border-border/40 py-1 text-sm">
                                <label className="flex min-w-[240px] flex-1 items-center gap-2">
                                  <input type="checkbox" checked={on} onChange={() => toggle(perm.key)} />
                                  <span>{perm.label}</span>
                                  <code className="text-[11px] text-muted-foreground">{perm.key}</code>
                                </label>
                                {on && scopeLess ? (
                                  <span className="text-xs text-muted-foreground">
                                    {t('adminDomains.rbac.createProjectNoScope')}
                                  </span>
                                ) : null}
                                {on && !scopeLess ? (
                                  <select
                                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                                    value={selected[perm.key]}
                                    onChange={(e) => setScope(perm.key, e.target.value)}
                                    aria-label={perm.key}
                                  >
                                    {SCOPE_VALUES.map((scope) => (
                                      <option key={scope} value={scope}>
                                        {scopeLabel(scope)}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {t('adminDomains.rbac.selectOrgRoleFirst')}
            </p>
          )}
        </AdminUserFormCard>
      ) : null}
    </AdminUserPanelShell>
  );
}
