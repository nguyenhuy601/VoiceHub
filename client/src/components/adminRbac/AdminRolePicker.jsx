import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import { adminInputClass } from '../adminUsers/adminUserPanelUi';
import { handlePickerListKeyDown } from '../adminUsers/pickerListKeyboard';
import useAdminRoles from '../../hooks/useAdminRoles';
import useRoleMasterGrantsMap from '../../hooks/useRoleMasterGrantsMap';
import {
  isProtectedDefaultRole,
  normalizeRoleDisplayName,
  normalizeRoleId,
} from '../../utils/adminRbacUtils';
import { countMasterGrants } from '../../utils/rbacV2Ui';
import { AdminEmptyState, AdminListSkeleton, AdminLoadErrorState } from '../adminUsers/adminPanelStates';

export default function AdminRolePicker({ orgId, selectedRoleId, onSelect, hint, systemOnly = true }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const { roles, systemRoles, loading, error, loadRoles } = useAdminRoles(orgId);
  const source = systemOnly ? systemRoles : roles;
  const { grantsByRoleId } = useRoleMasterGrantsMap(orgId, source);

  const activeId = String(selectedRoleId || searchParams.get('roleId') || '').trim();

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
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">{t('adminRbac.pickerTitle')}</h3>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('adminRbac.searchPlaceholder')}
        aria-label={t('adminRbac.searchPlaceholder')}
        maxLength={120}
        className={adminInputClass()}
      />
      {loading && !source.length ? (
        <AdminListSkeleton rows={3} />
      ) : error ? (
        <AdminLoadErrorState message={error} onRetry={() => loadRoles()} />
      ) : (
        <div className="max-h-64 overflow-auto rounded-lg border border-border" aria-busy={loading || undefined}>
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('adminRbac.colName')}</th>
                <th className="px-3 py-2">{t('adminRbac.colPermissions')}</th>
              </tr>
            </thead>
            <tbody onKeyDown={handlePickerListKeyDown}>
              {filtered.map((role) => {
                const id = normalizeRoleId(role);
                const active = id === activeId;
                return (
                  <tr
                    key={id}
                    className={`cursor-pointer border-t border-border transition-colors duration-150 motion-reduce:transition-none ${active ? 'bg-primary-subtle' : 'hover:bg-muted'}`}
                    onClick={() => pick(id)}
                  >
                    <td className="px-3 py-2 font-medium">
                      <button
                        type="button"
                        aria-current={active ? 'true' : undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          pick(id);
                        }}
                        className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {normalizeRoleDisplayName(role.name)}
                      </button>
                      {isProtectedDefaultRole(role) ? (
                        <span className="ml-2 text-[10px] text-muted-foreground">({t('adminRbac.systemBadge')})</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{countMasterGrants(grantsByRoleId[id])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length ? <AdminEmptyState message={t('adminRbac.noRoles')} /> : null}
        </div>
      )}
    </div>
  );
}
