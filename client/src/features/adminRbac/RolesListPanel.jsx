import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { DEFAULT_ROLE_SCOPE, ROLE_SCOPES } from '../../config/rbacRoleScope';
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
import { adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';

const PERM_PACK_MANAGE_HUB = '/app/admin/rbac/roles/manage';

/** Chỉ lối V2 + assign/delete — không dẫn vào grid V1 `/rbac/edit`. */
const ACTION_LINKS = [
  {
    path: '/app/admin/rbac/permissions',
    labelKey: 'adminDomains.rbac.permissions',
    useRoleId: true,
    grant: RBAC_GRANT.PERM_GROUP_UPDATE_GRANT,
  },
  { tab: 'delete', labelKey: 'adminDomains.rbac.delete', hub: PERM_PACK_MANAGE_HUB, grant: RBAC_GRANT.PERM_GROUP_CLONE },
  { tab: 'assign', labelKey: 'adminDomains.rbac.assign', hub: PERM_PACK_MANAGE_HUB, grant: RBAC_GRANT.PERM_GROUP_ASSIGN },
];

function roleScopeLabel(scope, t) {
  const id = String(scope || DEFAULT_ROLE_SCOPE).trim().toUpperCase() || DEFAULT_ROLE_SCOPE;
  const found = ROLE_SCOPES.find((item) => item.id === id);
  if (!found) return id;
  const translated = t(found.labelKey);
  if (translated && translated !== found.labelKey) return translated;
  return found.fallback || id;
}

export default function RolesListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { systemRoles, loading, error, loadRoles } = useAdminRoles(orgId);
  const { catalog, grantsByRoleId } = useRoleMasterGrantsMap(orgId, systemRoles);
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const [query, setQuery] = useState('');
  const totalSlots = (catalog?.masterPermissions || []).filter(
    (k) => !String(k || '').startsWith('project.')
  ).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return systemRoles;
    return systemRoles.filter((role) => {
      const name = normalizeRoleDisplayName(role.name).toLowerCase();
      const id = normalizeRoleId(role).toLowerCase();
      return name.includes(q) || id.includes(q);
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
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
          >
            {t('adminDomains.rbac.create')}
          </Link>
          <Link
            to="/app/admin/rbac/hierarchy"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
          >
            {t('adminDomains.rbac.hierarchy')}
          </Link>
          <Link
            to="/app/admin/rbac/matrix"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
          >
            {t('adminDomains.rbac.matrix')}
          </Link>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-sm">
        <p className="font-medium text-foreground">{t('adminRbac.listV2Title')}</p>
        <p className="text-muted-foreground">{t('adminRbac.listV2Body')}</p>
        <p className="text-muted-foreground">{t('adminRbac.listScopeNote')}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            to="/app/admin/rbac/positions"
            className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-muted/40"
          >
            {t('adminRbac.listLinkPosition')}
          </Link>
          <Link
            to="/app/admin/rbac/org-roles"
            className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-muted/40"
          >
            {t('adminRbac.listLinkOrgRole')}
          </Link>
          <Link
            to="/app/admin/rbac/project-roles"
            className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-muted/40"
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
        className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="overflow-auto rounded-xl border border-border">
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
          <>
            <table className="min-w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t('adminRbac.colName')}</th>
                  <th className="px-3 py-2">{t('adminRbac.roleScope')}</th>
                  <th className="px-3 py-2">{t('adminRbac.colPriority')}</th>
                  <th className="px-3 py-2">{t('adminRbac.colPermissions')}</th>
                  <th className="px-3 py-2">{t('adminRbac.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((role) => {
                  const id = normalizeRoleId(role);
                  const granted = countMasterGrants(grantsByRoleId[id]);
                  const displayName = normalizeRoleDisplayName(role.name);
                  const displaySystemName = splitLayerLabel(displayName, 'system').suffix || displayName;
                  return (
                    <tr key={id} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <span title={id || undefined}>{displaySystemName}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase text-muted-foreground">
                            {t('adminRbac.listKindBadge')}
                          </span>
                        </div>
                        {role.description ? (
                          <div className="mt-0.5 text-xs font-normal text-muted-foreground line-clamp-1">
                            {role.description}
                          </div>
                        ) : null}
                        {isProtectedDefaultRole(role) ? (
                          <span className="text-[10px] text-muted-foreground">({t('adminRbac.systemBadge')})</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground" title={String(role.scope || DEFAULT_ROLE_SCOPE)}>
                        {roleScopeLabel(role.scope, t)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{role.priority ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {granted}/{totalSlots}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {ACTION_LINKS.filter((link) =>
                            canActWithGrant(isFullAccess, hasGrant, link.grant)
                          ).map((link) => (
                            <Link
                              key={link.path || link.tab}
                              to={
                                link.useRoleId
                                  ? `${link.path}?roleId=${encodeURIComponent(id)}`
                                  : adminRoleHubLink(link.hub, id, link.tab)
                              }
                              className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
                            >
                              {t(link.labelKey)}
                            </Link>
                          ))}
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
          </>
        )}
      </div>
    </div>
  );
}
