/** Position (HR) — admin RBAC */
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { DEFAULT_HR_ROLE_KEYS, DEFAULT_HR_ROLE_LABELS, ROLE_KIND } from '../../utils/roleTaxonomy';

const RBAC_POS_BASE = '/app/admin/rbac/positions';

function memberJobTitle(member) {
  return String(member?.jobTitle || member?.preferences?.jobTitle || '').trim();
}

const ACTION_LINKS = [
  { path: `${RBAC_POS_BASE}/edit`, labelKey: 'adminDomains.rbac.posEdit' },
  { path: `${RBAC_POS_BASE}/assign`, labelKey: 'adminDomains.rbac.posAssign' },
  { path: `${RBAC_POS_BASE}/disable`, labelKey: 'adminDomains.rbac.posDisable' },
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
      title={t('adminDomains.rbac.posList')}
      hint={t('adminRbac.posListHint')}
      wide
      actions={
        <Link to={`${RBAC_POS_BASE}/create`} className={adminPrimaryBtnClass()}>
          <Plus className="h-4 w-4" />
          {t('adminDomains.rbac.posCreate')}
        </Link>
      }
    >
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {t('adminRbac.positionCatalogZeroPerm')}
      </p>

      <AdminUserFormCard title={t('adminRbac.posSuggestedTitles')}>
        <ul className="flex flex-wrap gap-2">
          {DEFAULT_HR_ROLE_KEYS.map((key) => {
            const label = DEFAULT_HR_ROLE_LABELS[key] || key;
            return (
              <li key={key}>
                <Link
                  to={`${RBAC_POS_BASE}/assign?title=${encodeURIComponent(label)}`}
                  className={adminSecondaryBtnClass('!px-2 !py-1 text-xs')}
                  title={`${key} · ${ROLE_KIND.HR}`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </AdminUserFormCard>

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
