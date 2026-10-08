/** Position (HR) — admin RBAC — catalog master (enable qua Master Data), không tạo key tùy chỉnh. */
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AdminDenseMobileList,
  AdminDenseTableCard,
  AdminDenseTableScroll,
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDenseRowClass,
  adminInputClass,
  adminSecondaryBtnClass,
  adminManageLinkClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { DEFAULT_HR_ROLE_KEYS, DEFAULT_HR_ROLE_LABELS, ROLE_KIND } from '../../utils/roleTaxonomy';
import { organizationAPI } from '../../services/api/organizationAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { adminQueryHubLink } from '../../utils/adminHubLinks';
import { memberJobTitle } from '../../utils/userTaxonomyUtils';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';

const RBAC_POS_MANAGE_HUB = '/app/admin/rbac/positions/manage';
const RBAC_POS_BASE = '/app/admin/rbac/positions';

export default function PosListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { members, loading, error: membersError, loadMembers } = useAdminMembers(orgId, { view: 'directory' });
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canUpdatePosition = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.POSITION_UPDATE);
  const canAssignPosition = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.EMPLOYEE_UPDATE);
  const manageTab = canUpdatePosition ? 'edit' : 'assign';
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
      <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        {t('adminRbac.positionCatalogZeroPerm')} {t('adminRbac.posListMasterHint')}
      </p>

      {loadError || membersError ? (
        <AdminLoadErrorState
          message={
            loadError ||
            resolveApiErrorMessage(membersError, {
              t,
              fallback: t('companyAdmin.loadMembersFail'),
            })
          }
          onRetry={async () => {
            await loadMembers();
            setReloadTick((n) => n + 1);
          }}
        />
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('adminOrg.searchPlaceholder')}
            aria-label={t('adminOrg.searchPlaceholder')}
            maxLength={120}
            className={`${adminInputClass()} pl-9`}
          />
        </div>
      </div>

      <AdminDenseTableCard>
        {(loading || hrPositionsLoading) && !titles.length ? (
          <AdminListSkeleton className="p-4" />
        ) : (
          <AdminDenseTableScroll aria-busy={loading || hrPositionsLoading || undefined}>
            <AdminDenseMobileList
              items={filtered}
              getKey={(row) => row.key || row.title}
              ariaLabel={t('adminDomains.rbac.posList')}
              renderTitle={(row) => row.title}
              renderMeta={(row) =>
                [
                  row.key || null,
                  `${t('adminOrg.colCount')}: ${row.count}`,
                  row.fromCatalog ? null : t('adminOrg.legacyBadge'),
                ]
                  .filter(Boolean)
                  .join(' · ')
              }
              renderActions={
                canUpdatePosition || canAssignPosition
                  ? (row) => (
                      <Link
                        to={adminQueryHubLink(RBAC_POS_MANAGE_HUB, { title: row.title }, manageTab)}
                        className={adminManageLinkClass()}
                      >
                        {t('adminDomains.rbac.posManageHub')}
                      </Link>
                    )
                  : undefined
              }
            />
            <table className="hidden min-w-full text-sm md:table">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <th className="px-4 py-3">{t('adminOrg.colTitle')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colCount')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.key || row.title} className={adminDenseRowClass()}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {row.title}
                      {row.key ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{row.key}</span>
                      ) : null}
                      {!row.fromCatalog ? (
                        <span className="ml-2 rounded bg-warning-bg px-1.5 py-0.5 text-[10px] text-warning">
                          {t('adminOrg.legacyBadge')}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.count}</td>
                    <td className="px-4 py-3">
                      {canUpdatePosition || canAssignPosition ? (
                        <Link
                          to={adminQueryHubLink(RBAC_POS_MANAGE_HUB, { title: row.title }, manageTab)}
                          className={adminManageLinkClass()}
                        >
                          {t('adminDomains.rbac.posManageHub')}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? <AdminEmptyState message={t('adminRbac.posCatalogEmptyEnable')} /> : null}
          </AdminDenseTableScroll>
        )}
      </AdminDenseTableCard>
    </AdminUserPanelShell>
  );
}
