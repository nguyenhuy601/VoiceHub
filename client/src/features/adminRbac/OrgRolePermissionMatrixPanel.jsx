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
import { canonicalizeOrgRoleLabel } from '../../utils/effectiveOrgRoleLabel';
import { filterOrgRoleCatalogRows } from '../../utils/orgRoleLocale';
import PermissionDomainCardBrowser from './PermissionDomainCardBrowser';
import { PermissionModuleGrantSections } from './PermissionModuleSections';
import {
  labelCategory,
  labelModule,
  labelPermission,
} from './permissionCatalogLabels';
import {
  filterHiddenOrgRolePermissionGroups,
  isHiddenOrgRolePermission,
} from './orgRolePermissionVisibility';
import { RBAC_GRANT } from '../../config/rbacUiGrantMap';
import { useAdminActionGate } from '../../hooks/useAdminActionGate';

const SCOPE_VALUES = ['SELF', 'DEPARTMENT', 'ORGANIZATION', 'SYSTEM'];

function flatKeys(domain) {
  return (domain?.modules || []).flatMap((mod) =>
    (mod.permissions || []).map((p) => p.key).filter(Boolean)
  );
}

/**
 * Step 2 — Gán Permission + Scope vào Organizational Role (role = gói quyền).
 */
export default function OrgRolePermissionMatrixPanel({ orgId }) {
  const { t } = useAppStrings();
  const { can, assertOrToast } = useAdminActionGate(orgId);
  const canUpdateOrgRole = can(RBAC_GRANT.ORG_ROLE_UPDATE);
  const [searchParams, setSearchParams] = useSearchParams();
  const [roles, setRoles] = useState([]);
  const [roleId, setRoleId] = useState(() => String(searchParams.get('roleId') || ''));
  const [groups, setGroups] = useState([]);
  const [filter, setFilter] = useState('');
  const [activeKey, setActiveKey] = useState('');
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
        .map((cat) => {
          const catKey = cat.key || cat.label;
          return {
            key: catKey,
            label: labelCategory(catKey, t),
            modules: (Array.isArray(cat.modules) ? cat.modules : [])
              .map((mod) => {
                const modKey = mod.key || mod.label;
                return {
                  key: modKey,
                  label: labelModule(modKey, t),
                  permissions: (Array.isArray(mod.permissions) ? mod.permissions : [])
                    .map((p) => {
                      const key = String(p.key || p.code || '').trim();
                      return {
                        key,
                        label: labelPermission(key, t),
                      };
                    })
                    .filter((p) => p.key),
                };
              })
              .filter((mod) => mod.permissions.length),
          };
        })
        .filter((cat) => cat.modules.length)
    );
  }, [t]);

  const loadMatrix = useCallback(
    async (rid) => {
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
    },
    [orgId]
  );

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
    const withoutLegacy = filterHiddenOrgRolePermissionGroups(groups);
    const q = filter.trim().toLowerCase();
    if (!q) return withoutLegacy;
    return withoutLegacy
      .map((cat) => ({
        ...cat,
        modules: cat.modules
          .map((mod) => ({
            ...mod,
            permissions: mod.permissions.filter((p) => {
              if (isHiddenOrgRolePermission(p.key)) return false;
              const display = labelPermission(p.key, t);
              const blob =
                `${p.key} ${p.label || ''} ${display} ${mod.label || ''} ${cat.label || ''}`.toLowerCase();
              return blob.includes(q);
            }),
          }))
          .filter((mod) => mod.permissions.length),
      }))
      .filter((cat) => cat.modules.length);
  }, [groups, filter, t]);

  useEffect(() => {
    if (!visibleGroups.length) {
      setActiveKey('');
      return;
    }
    if (!visibleGroups.some((d) => d.key === activeKey)) {
      setActiveKey(visibleGroups[0].key);
    }
  }, [visibleGroups, activeKey]);

  const allKeys = useMemo(
    () => visibleGroups.flatMap((cat) => flatKeys(cat)),
    [visibleGroups]
  );

  const selectedTotal = useMemo(
    () => allKeys.filter((k) => selected[k]).length,
    [allKeys, selected]
  );

  const cards = useMemo(
    () =>
      visibleGroups.map((cat) => {
        const keys = flatKeys(cat);
        return {
          key: cat.key,
          label: cat.label,
          total: keys.length,
          selected: keys.filter((k) => selected[k]).length,
        };
      }),
    [visibleGroups, selected]
  );

  const activeDomain = useMemo(
    () => visibleGroups.find((d) => d.key === activeKey) || null,
    [visibleGroups, activeKey]
  );

  const chooseRole = (nextId) => {
    setRoleId(nextId);
    const params = new URLSearchParams(searchParams);
    if (nextId) params.set('roleId', nextId);
    else params.delete('roleId');
    setSearchParams(params, { replace: true });
  };

  const roleOptions = useMemo(
    () =>
      filterOrgRoleCatalogRows(roles).map((r) => {
        const code = String(r.code || r.key || '').toLowerCase();
        const raw = r.label || r.name || r.key || r.code;
        const name =
          code === 'member' || raw === 'Member'
            ? t('adminDomains.rbac.orgRoleMemberDefault')
            : canonicalizeOrgRoleLabel(code, raw, t);
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

  const setDomainMany = (on) => {
    const keys = flatKeys(activeDomain);
    if (!keys.length) return;
    setSelected((prev) => {
      const next = { ...prev };
      for (const code of keys) {
        if (on) {
          if (!next[code]) next[code] = 'ORGANIZATION';
        } else {
          delete next[code];
        }
      }
      return next;
    });
  };

  const save = async () => {
    if (!orgId || !roleId || saving) return;
    if (!assertOrToast(RBAC_GRANT.ORG_ROLE_UPDATE)) return;
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

  const domainKeys = flatKeys(activeDomain);
  const domainSelected = domainKeys.filter((k) => selected[k]).length;

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
            {canUpdateOrgRole ? (
              <button
                type="button"
                className={adminPrimaryBtnClass()}
                disabled={!roleId || saving}
                onClick={save}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            ) : null}
            <button
              type="button"
              className={adminSecondaryBtnClass()}
              onClick={() => loadMatrix(roleId)}
            >
              {t('common.reload')}
            </button>
          </div>
          {roleId ? (
            <div className="mt-4">
              <PermissionDomainCardBrowser
                domains={cards}
                activeKey={activeKey}
                onSelect={setActiveKey}
                searchValue={filter}
                onSearchChange={setFilter}
                searchLabel={t('adminDomains.rbac.permissionSearch')}
                searchPlaceholder={t('adminDomains.rbac.permissionSearchPlaceholder')}
                navTitle={t('adminDomains.rbac.domainCardsNav')}
                detailHeading={t('adminDomains.rbac.domainDetailHeading')}
                pickHint={t('adminDomains.rbac.domainCardPickHint')}
                emptyNav={t('adminDomains.rbac.domainCardsEmpty')}
                summary={
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/25 px-3 py-2.5 text-sm shadow-sm">
                    <span className="font-medium text-foreground">
                      {t('adminDomains.rbac.matrixSelectedSummary', {
                        selected: selectedTotal,
                        total: allKeys.length,
                      })}
                    </span>
                    {activeDomain ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={adminSecondaryBtnClass('!px-2.5 !py-1 text-xs')}
                          onClick={() => setDomainMany(true)}
                          disabled={domainSelected >= domainKeys.length}
                        >
                          {t('adminDomains.rbac.selectAllInDomain')}
                        </button>
                        <button
                          type="button"
                          className={adminSecondaryBtnClass('!px-2.5 !py-1 text-xs')}
                          onClick={() => setDomainMany(false)}
                          disabled={!domainSelected}
                        >
                          {t('adminDomains.rbac.clearDomainSelection')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                }
              >
                <PermissionModuleGrantSections
                  modules={activeDomain?.modules || []}
                  emptyLabel={t('adminDomains.rbac.domainDetailEmpty')}
                  resolveLabel={(code) => labelPermission(code, t)}
                  isOn={(code) => Boolean(selected[code])}
                  onToggle={toggle}
                  renderTrailing={(perm, on) => {
                    if (!on) return null;
                    if (isScopeLessGrant(perm.key)) {
                      return (
                        <span className="text-xs text-muted-foreground">
                          {t('adminDomains.rbac.createProjectNoScope')}
                        </span>
                      );
                    }
                    return (
                      <select
                        className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
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
                    );
                  }}
                />
              </PermissionDomainCardBrowser>
            </div>
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
