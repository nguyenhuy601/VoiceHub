import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import useAdminRoles from '../../hooks/useAdminRoles';
import {
  grantedPermissionCount,
  isProtectedDefaultRole,
  normalizeRoleDisplayName,
  normalizeRoleId,
  totalPermissionSlotCount,
} from '../../utils/adminRbacUtils';

const ACTION_LINKS = [
  { path: '/app/admin/rbac/edit', labelKey: 'adminDomains.rbac.edit' },
  { path: '/app/admin/rbac/permissions', labelKey: 'adminDomains.rbac.permissions' },
  { path: '/app/admin/rbac/delete', labelKey: 'adminDomains.rbac.delete' },
  { path: '/app/admin/rbac/assign', labelKey: 'adminDomains.rbac.assign' },
];

export default function RolesListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { systemRoles, loading } = useAdminRoles(orgId);
  const [query, setQuery] = useState('');
  const totalSlots = useMemo(() => totalPermissionSlotCount(), []);

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
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('adminRbac.searchPlaceholder')}
        className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="overflow-auto rounded-xl border border-border">
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
              const granted = grantedPermissionCount(role.permissions);
              return (
                <tr key={id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium">
                    <div>{normalizeRoleDisplayName(role.name)}</div>
                    {role.description ? (
                      <div className="mt-0.5 text-xs font-normal text-muted-foreground line-clamp-1">
                        {role.description}
                      </div>
                    ) : null}
                    {isProtectedDefaultRole(role) ? (
                      <span className="ml-0 text-[10px] text-muted-foreground">({t('adminRbac.systemBadge')})</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{role.scope || 'ORGANIZATION'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{role.priority ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {granted}/{totalSlots}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {ACTION_LINKS.map((link) => (
                        <Link
                          key={link.path}
                          to={`${link.path}?roleId=${encodeURIComponent(id)}`}
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
        {!loading && !filtered.length ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminRbac.noRoles')}</p>
        ) : null}
        {loading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : null}
      </div>
    </div>
  );
}
