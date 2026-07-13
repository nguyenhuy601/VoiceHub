/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  AdminUserPanelShell,
  adminInputClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';

function memberJobTitle(member) {
  return String(member?.jobTitle || member?.preferences?.jobTitle || '').trim();
}

const ACTION_LINKS = [
  { path: '/app/admin/org-structure/positions/edit', labelKey: 'adminDomains.orgStructure.posEdit' },
  { path: '/app/admin/org-structure/positions/assign', labelKey: 'adminDomains.orgStructure.posAssign' },
  { path: '/app/admin/org-structure/positions/disable', labelKey: 'adminDomains.orgStructure.posDisable' },
];

export default function PosListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { members, loading } = useAdminMembers(orgId);
  const [query, setQuery] = useState('');

  const titles = useMemo(() => {
    const map = new Map();
    for (const m of members) {
      const title = memberJobTitle(m);
      if (!title) continue;
      map.set(title, (map.get(title) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [members]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return titles;
    return titles.filter((row) => row.title.toLowerCase().includes(q));
  }, [titles, query]);

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.posList')}
      hint={t('adminOrg.posListHint')}
      wide
      actions={
        <Link to="/app/admin/org-structure/positions/create" className={adminPrimaryBtnClass()}>
          <Plus className="h-4 w-4" />
          {t('adminDomains.orgStructure.posCreate')}
        </Link>
      }
    >
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('adminOrg.searchPlaceholder')}
            className={`${adminInputClass()} pl-9`}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="sticky top-0 border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">{t('adminOrg.colTitle')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colCount')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.title} className="border-b border-border/50 transition hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium text-foreground">{row.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.count}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {ACTION_LINKS.map((link) => (
                          <Link
                            key={link.path}
                            to={`${link.path}?title=${encodeURIComponent(row.title)}`}
                            className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
                          >
                            {t(link.labelKey)}
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t('adminOrg.noPositions')}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </AdminUserPanelShell>
  );
}
