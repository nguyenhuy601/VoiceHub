import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import useAdminRoles from '../../hooks/useAdminRoles';
import useRoleMasterGrantsMap from '../../hooks/useRoleMasterGrantsMap';
import {
  isProtectedDefaultRole,
  normalizeRoleDisplayName,
  normalizeRoleId,
} from '../../utils/adminRbacUtils';
import { countMasterGrants } from '../../utils/rbacV2Ui';
import { splitLayerLabel } from '../../utils/roleLayerNaming';
import { adminRoleHubLink } from '../../utils/adminHubLinks';
import {
  adminDenseRowClass,
  adminManageLinkClass,
  adminPrimaryBtnClass,
  AdminDenseMobileList,
  AdminDenseTableCard,
  AdminDenseTableScroll,
} from '../../components/adminUsers/adminUserPanelUi';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';

const PERM_PACK_MANAGE_HUB = '/app/admin/rbac/roles/manage';

function roleKeyOf(role) {
  return String(role?.key || role?.code || normalizeRoleId(role) || '').trim() || '—';
}

function roleUpdatedLabel(role, locale) {
  const raw = role?.updatedAt || role?.updated_at || role?.modifiedAt || null;
  if (!raw) {
    return isProtectedDefaultRole(role) ? 'system' : '—';
  }
  try {
    return new Date(raw).toLocaleString(locale || undefined);
  } catch {
    return String(raw);
  }
}

export default function RolesListPanel({ orgId }) {
  const { t, locale } = useAppStrings();
  const { systemRoles, loading, error, loadRoles } = useAdminRoles(orgId);
  const { grantsByRoleId } = useRoleMasterGrantsMap(orgId, systemRoles);
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canManage = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.PERM_GROUP_ASSIGN);
  const canDelete = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.PERM_GROUP_CLONE);
  const canOpenPermissions = canActWithGrant(
    isFullAccess,
    hasGrant,
    RBAC_GRANT.PERM_GROUP_UPDATE_GRANT
  );
  const [query, setQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return systemRoles;
    return systemRoles.filter((role) => {
      const name = normalizeRoleDisplayName(role.name).toLowerCase();
      const id = normalizeRoleId(role).toLowerCase();
      const key = roleKeyOf(role).toLowerCase();
      return name.includes(q) || id.includes(q) || key.includes(q);
    });
  }, [systemRoles, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t('adminDomains.rbac.roles')}</h2>
          <p className="text-sm text-muted-foreground">{t('adminRbac.listHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/admin/rbac/create"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            {t('adminDomains.rbac.create')}
          </Link>
          <Link
            to="/app/admin/rbac/hierarchy"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            {t('adminDomains.rbac.hierarchy')}
          </Link>
          <Link
            to="/app/admin/rbac/matrix"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            {t('adminDomains.rbac.matrix')}
          </Link>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-warning bg-warning-bg px-3 py-3 text-sm">
        <p className="font-medium text-foreground">{t('adminRbac.listV2Title')}</p>
        <p className="text-muted-foreground">{t('adminRbac.listV2Body')}</p>
        <p className="text-muted-foreground">{t('adminRbac.listScopeNote')}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            to="/app/admin/rbac/positions"
            className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
          >
            {t('adminRbac.listLinkPosition')}
          </Link>
          <Link
            to="/app/admin/rbac/org-roles"
            className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
          >
            {t('adminRbac.listLinkOrgRole')}
          </Link>
          <Link
            to="/app/admin/rbac/project-roles"
            className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
          >
            {t('adminRbac.listLinkProjectRole')}
          </Link>
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('adminRbac.searchPlaceholder')}
        aria-label={t('adminRbac.searchPlaceholder')}
        className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <AdminDenseTableCard>
        {loading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
        ) : error ? (
          <div className="space-y-3 px-3 py-4">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadRoles()}>
              {t('adminRbac.retry')}
            </button>
          </div>
        ) : (
          <AdminDenseTableScroll>
            <AdminDenseMobileList
              items={filtered}
              getKey={normalizeRoleId}
              ariaLabel={t('adminDomains.rbac.roles')}
              renderTitle={(role) => {
                const displayName = normalizeRoleDisplayName(role.name);
                return splitLayerLabel(displayName, 'system').suffix || displayName;
              }}
              renderMeta={(role) => {
                const updated = roleUpdatedLabel(role, locale);
                return [
                  roleKeyOf(role),
                  `${t('adminRbac.colPermissions')}: ${countMasterGrants(grantsByRoleId[normalizeRoleId(role)])}`,
                  updated === 'system' ? t('adminRbac.systemBadge') : updated,
                ].join(' · ');
              }}
              renderActions={(role) => {
                const id = normalizeRoleId(role);
                return (
                  <>
                    {canManage ? (
                      <Link to={adminRoleHubLink(PERM_PACK_MANAGE_HUB, id, 'assign')} className={adminManageLinkClass()}>
                        {t('adminDomains.rbac.permPackManageHub')}
                      </Link>
                    ) : null}
                    {canOpenPermissions ? (
                      <Link
                        to={`/app/admin/rbac/permissions?roleId=${encodeURIComponent(id)}`}
                        className={adminManageLinkClass()}
                      >
                        {t('adminDomains.rbac.permissions')}
                      </Link>
                    ) : null}
                    {canDelete ? (
                      <Link to={adminRoleHubLink(PERM_PACK_MANAGE_HUB, id, 'delete')} className={adminManageLinkClass()}>
                        {t('adminDomains.rbac.delete')}
                      </Link>
                    ) : null}
                  </>
                );
              }}
            />
            <table className="hidden min-w-full text-sm md:table">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-2">{t('adminRbac.colName')}</th>
                  <th className="px-3 py-2">{t('adminRbac.colKey')}</th>
                  <th className="px-3 py-2">{t('adminRbac.colPermissions')}</th>
                  <th className="px-3 py-2">{t('adminOrg.colStatus')}</th>
                  <th className="px-3 py-2">{t('adminRbac.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((role) => {
                  const id = normalizeRoleId(role);
                  const granted = countMasterGrants(grantsByRoleId[id]);
                  const displayName = normalizeRoleDisplayName(role.name);
                  const displaySystemName = splitLayerLabel(displayName, 'system').suffix || displayName;
                  const updated = roleUpdatedLabel(role, locale);
                  const menuOpen = menuOpenId === id;
                  return (
                    <tr key={id} className={adminDenseRowClass('border-t border-border')}>
                      <td className="px-3 py-2 font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <span title={id || undefined}>{displaySystemName}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase text-muted-foreground">
                            {t('adminRbac.listKindBadge')}
                          </span>
                        </div>
                        {isProtectedDefaultRole(role) ? (
                          <span className="text-[10px] text-muted-foreground">
                            ({t('adminRbac.systemBadge')})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground" title={id}>
                        {roleKeyOf(role)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{granted}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {updated === 'system' ? t('adminRbac.systemBadge') : updated}
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative flex flex-wrap items-center gap-1">
                          {canManage ? (
                            <Link
                              to={adminRoleHubLink(PERM_PACK_MANAGE_HUB, id, 'assign')}
                              className={adminManageLinkClass()}
                            >
                              {t('adminDomains.rbac.permPackManageHub')}
                            </Link>
                          ) : null}
                          {canOpenPermissions || canManage || canDelete ? (
                            <button
                              type="button"
                              className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted"
                              aria-expanded={menuOpen}
                              aria-label={t('adminRbac.moreActions')}
                              onClick={() => setMenuOpenId(menuOpen ? '' : id)}
                            >
                              …
                            </button>
                          ) : !canManage ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : null}
                          {menuOpen ? (
                            <div className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-lg border border-border bg-card py-1 shadow-md">
                              {canOpenPermissions ? (
                                <Link
                                  to={`/app/admin/rbac/permissions?roleId=${encodeURIComponent(id)}`}
                                  className="block px-3 py-1.5 text-xs hover:bg-muted"
                                  onClick={() => setMenuOpenId('')}
                                >
                                  {t('adminDomains.rbac.permissions')}
                                </Link>
                              ) : null}
                              {canDelete ? (
                                <Link
                                  to={adminRoleHubLink(PERM_PACK_MANAGE_HUB, id, 'delete')}
                                  className="block px-3 py-1.5 text-xs hover:bg-muted"
                                  onClick={() => setMenuOpenId('')}
                                >
                                  {t('adminDomains.rbac.delete')}
                                </Link>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminRbac.noRoles')}</p>
            ) : null}
          </AdminDenseTableScroll>
        )}
      </AdminDenseTableCard>
    </div>
  );
}
