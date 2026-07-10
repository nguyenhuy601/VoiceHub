import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import useAdminMembers from '../../hooks/useAdminMembers';
import { memberDisplayName, memberEmail, memberOrgRole, memberUserId } from '../../utils/adminUserUtils';

export default function AdminUserPicker({
  orgId,
  selectedUserId,
  onSelect,
  hint,
}) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const { members, loading } = useAdminMembers(orgId);

  const activeId = String(selectedUserId || searchParams.get('userId') || '').trim();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const id = memberUserId(m);
      return (
        memberDisplayName(m).toLowerCase().includes(q) ||
        memberEmail(m).toLowerCase().includes(q) ||
        id.toLowerCase().includes(q)
      );
    });
  }, [members, query]);

  const pick = (userId) => {
    const id = String(userId || '').trim();
    if (!id) return;
    onSelect?.(id);
    const next = new URLSearchParams(searchParams);
    next.set('userId', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
      <div>
        <h3 className="text-sm font-semibold">{t('adminUsers.pickerTitle')}</h3>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('adminUsers.searchPlaceholder')}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="max-h-64 overflow-auto rounded-lg border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('companyAdmin.colName')}</th>
                <th className="px-3 py-2">{t('companyAdmin.colEmail')}</th>
                <th className="px-3 py-2">{t('companyAdmin.colRole')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const id = memberUserId(m);
                const active = id === activeId;
                return (
                  <tr
                    key={id}
                    className={`cursor-pointer border-t border-border/60 transition ${active ? 'bg-red-500/10' : 'hover:bg-muted/30'}`}
                    onClick={() => pick(id)}
                  >
                    <td className="px-3 py-2 font-medium">{memberDisplayName(m)}</td>
                    <td className="px-3 py-2">{memberEmail(m)}</td>
                    <td className="px-3 py-2">{memberOrgRole(m)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminUsers.noUsers')}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
