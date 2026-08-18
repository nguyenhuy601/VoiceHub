/** Position (HR) — admin RBAC — catalog master (enable qua Master Data), không tạo key tùy chỉnh. */
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
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
import { organizationAPI } from '../../services/api/organizationAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { adminQueryHubLink } from '../../utils/adminHubLinks';

const RBAC_POS_MANAGE_HUB = '/app/admin/rbac/positions/manage';
const RBAC_POS_BASE = '/app/admin/rbac/positions';

function memberJobTitle(member) {
  return String(member?.jobTitle || member?.preferences?.jobTitle || '').trim();
}

const ACTION_LINKS = [
  { tab: 'assign', labelKey: 'adminDomains.rbac.posAssign' },
  { tab: 'edit', labelKey: 'adminDomains.rbac.posEdit' },
  { tab: 'disable', labelKey: 'adminDomains.rbac.posDisable' },
];

export default function PosListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { members, loading, error: membersError, loadMembers } = useAdminMembers(orgId);
  const [query, setQuery] = useState('');
  const [hrPositions, setHrPositions] = useState([]);
  const [hrPositionsLoading, setHrPositionsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setHrPositionsLoading(true);
      setLoadError('');
      try {
        const res = await organizationAPI.listHrPositions(orgId);
        const data = res?.data?.data ?? res?.data ?? res;
        if (cancelled) return;
        setHrPositions(Array.isArray(data?.positions) ? data.positions : []);
      } catch (error) {
        if (!cancelled) {
          setHrPositions([]);
          const msg = resolveApiErrorMessage(error, {
            t,
            fallback: t('adminRbac.masterDataLoadFail'),
          });
          setLoadError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setHrPositionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, t, reloadTick]);

  const memberCountByTitle = useMemo(() => {
    const map = new Map();
    for (const m of members) {
      const title = memberJobTitle(m);
      if (!title) continue;
      map.set(title, (map.get(title) || 0) + 1);
    }
    return map;
  }, [members]);

  const titles = useMemo(() => {
    const map = new Map();
    // Catalog hệ thống (enabled) — nguồn chính sau Phase 2.0
    for (const row of hrPositions || []) {
      const title = String(row?.title || '').trim();
      if (!title) continue;
      map.set(title, {
        title,
        key: row?.key || '',
        count: memberCountByTitle.get(title) || 0,
        fromCatalog: true,
      });
    }
    // Job title trên hồ sơ chưa nằm trong catalog (legacy)
    for (const [title, count] of memberCountByTitle.entries()) {
      if (map.has(title)) {
        map.get(title).count = count;
        continue;
      }
      map.set(title, { title, key: '', count, fromCatalog: false });
    }
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [hrPositions, memberCountByTitle]);

  const suggested = useMemo(() => {
    if (hrPositions.length) {
      return hrPositions.map((row) => ({
        key: row.key || row.title,
        label: row.title || row.key,
      }));
    }
    return DEFAULT_HR_ROLE_KEYS.map((key) => ({
      key,
      label: DEFAULT_HR_ROLE_LABELS[key] || key,
    }));
  }, [hrPositions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return titles;
    return titles.filter(
      (row) =>
        row.title.toLowerCase().includes(q) || String(row.key || '').toLowerCase().includes(q)
    );
  }, [titles, query]);

  if (!orgId) {
    return (
      <AdminUserPanelShell title={t('adminDomains.rbac.posList')} hint={t('adminRbac.posListHint')}>
        <p className="text-sm text-muted-foreground">{t('adminOrg.selectOrgHint')}</p>
      </AdminUserPanelShell>
    );
  }

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.posList')}
      hint={t('adminRbac.posListHint')}
      wide
      actions={
        <div className="flex flex-wrap gap-2">
          <Link to="/app/admin/rbac/master-data" className={adminSecondaryBtnClass()}>
            {t('adminDomains.rbac.masterData')}
          </Link>
          <Link to={`${RBAC_POS_BASE}/assign`} className={adminSecondaryBtnClass()}>
            {t('adminDomains.rbac.posAssign')}
          </Link>
        </div>
      }
    >
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {t('adminRbac.positionCatalogZeroPerm')} {t('adminRbac.posListMasterHint')}
      </p>

      {loadError || membersError ? (
        <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
          <p className="text-sm text-destructive">
            {loadError ||
              resolveApiErrorMessage(membersError, {
                t,
                fallback: t('companyAdmin.loadMembersFail'),
              })}
          </p>
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            onClick={async () => {
              await loadMembers();
              setReloadTick((n) => n + 1);
            }}
          >
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : null}

      <AdminUserFormCard title={t('adminRbac.posSuggestedTitles')}>
        <ul className="flex flex-wrap gap-2">
          {suggested.map((item) => (
            <li key={item.key}>
              <Link
                to={`${RBAC_POS_BASE}/assign?title=${encodeURIComponent(item.label)}`}
                className={adminSecondaryBtnClass('!px-2 !py-1 text-xs')}
                title={`${item.key} · ${ROLE_KIND.HR}`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        {!suggested.length ? (
          <p className="text-sm text-muted-foreground">{t('adminRbac.posCatalogEmptyEnable')}</p>
        ) : null}
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
        {loading || hrPositionsLoading ? (
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
                  <tr key={row.key || row.title} className="border-b border-border/50 transition hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {row.title}
                      {row.key ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{row.key}</span>
                      ) : null}
                      {!row.fromCatalog ? (
                        <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-200">
                          legacy
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.count}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {ACTION_LINKS.map((link) => (
                          <Link
                            key={link.tab}
                            to={adminQueryHubLink(RBAC_POS_MANAGE_HUB, { title: row.title }, link.tab)}
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
                {t('adminRbac.posCatalogEmptyEnable')}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </AdminUserPanelShell>
  );
}
