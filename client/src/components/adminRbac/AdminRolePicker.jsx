import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import { adminPrimaryBtnClass } from '../adminUsers/adminUserPanelUi';
import useAdminRoles from '../../hooks/useAdminRoles';
import {
  grantedPermissionCount,
  isProtectedDefaultRole,
  normalizeRoleDisplayName,
  normalizeRoleId,
} from '../../utils/adminRbacUtils';

export default function AdminRolePicker({ orgId, selectedRoleId, onSelect, hint, systemOnly = true }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const { roles, systemRoles, loading, error, loadRoles } = useAdminRoles(orgId);

  const activeId = String(selectedRoleId || searchParams.get('roleId') || '').trim();
  const source = systemOnly ? systemRoles : roles;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return source;
    return source.filter((role) => {
      const name = normalizeRoleDisplayName(role.name).toLowerCase();
      const id = normalizeRoleId(role).toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [source, query]);

  const pick = (roleId) => {
    const id = String(roleId || '').trim();
    if (!id) return;
    onSelect?.(id);
    const next = new URLSearchParams(searchParams);
    next.set('roleId', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
      <div>
        <h3 className="text-sm font-semibold">{t('adminRbac.pickerTitle')}</h3>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('adminRbac.searchPlaceholder')}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{error}</p>
          <div className="mt-3">
            <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadRoles()}>
              {t('adminRbac.retry')}
            </button>
          </div>
        </div>
      ) : (
        <div className="max-h-64 overflow-auto rounded-lg border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('adminRbac.colName')}</th>
                <th className="px-3 py-2">{t('adminRbac.colPermissions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((role) => {
                const id = normalizeRoleId(role);
                const active = id === activeId;
                return (
                  <tr
                    key={id}
                    className={`cursor-pointer border-t border-border/60 transition ${active ? 'bg-red-500/10' : 'hover:bg-muted/30'}`}
                    onClick={() => pick(id)}
                  >
                    <td className="px-3 py-2 font-medium">
                      {normalizeRoleDisplayName(role.name)}
                      {isProtectedDefaultRole(role) ? (
                        <span className="ml-2 text-[10px] text-muted-foreground">({t('adminRbac.systemBadge')})</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{grantedPermissionCount(role.permissions)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminRbac.noRoles')}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
