/** Vị trí tổ chức thật (OrganizationalPosition), không trộn chức danh hồ sơ hay catalog. */
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AdminDenseMobileList,
  AdminDenseTableCard,
  AdminDenseTableScroll,
  AdminUserPanelShell,
  adminDenseRowClass,
  adminInputClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
  adminManageLinkClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import { organizationAPI } from '../../services/api/organizationAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';

const RBAC_POS_BASE = '/app/admin/rbac/positions';

export default function PosListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canUpdatePosition = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.POSITION_UPDATE);
  const canCreatePosition = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.POSITION_CREATE);
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

  const titles = useMemo(() => {
    return (hrPositions || [])
      .map((row) => ({
        id: String(row?.id || row?._id || ''),
        title: String(row?.title || row?.name || '').trim(),
        key: String(row?.key || row?.code || '').trim(),
      }))
      .filter((row) => row.id && row.title)
      .sort((a, b) => a.title.localeCompare(b.title));
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
      <AdminUserPanelShell title={t('adminDomains.rbac.posList')}>
      </AdminUserPanelShell>
    );
  }

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.posList')}
      wide
      actions={
        <div className="flex flex-wrap gap-2">
          {canCreatePosition ? (
            <Link to={`${RBAC_POS_BASE}/create`} className={adminPrimaryBtnClass()}>
              {t('adminDomains.rbac.posCreate')}
            </Link>
          ) : null}
          <Link to={`${RBAC_POS_BASE}/roles`} className={adminSecondaryBtnClass()}>
            {t('adminDomains.rbac.assignPositionRoles')}
          </Link>
          <Link to={`${RBAC_POS_BASE}/assign`} className={adminSecondaryBtnClass()}>
            {t('adminDomains.rbac.posAssign')}
          </Link>
        </div>
      }
    >
      <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        {t('adminDomains.rbac.realPositionHint')}      </p>

      {loadError ? (
        <AdminLoadErrorState message={loadError} onRetry={() => setReloadTick((n) => n + 1)} />
      ) : null}

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
        {hrPositionsLoading && !titles.length ? (
          <AdminListSkeleton className="p-4" />
        ) : (
          <AdminDenseTableScroll aria-busy={hrPositionsLoading || undefined}>
            <AdminDenseMobileList
              items={filtered}
              getKey={(row) => row.id}
              ariaLabel={t('adminDomains.rbac.posList')}
              renderTitle={(row) => row.title}
              renderMeta={(row) => row.key || null}
              renderActions={
                canUpdatePosition
                  ? (row) => (
                      <Link
                        to={`${RBAC_POS_BASE}/roles?positionId=${encodeURIComponent(row.id)}`}
                        className={adminManageLinkClass()}
                      >
                        {t('adminDomains.rbac.assignPositionRoles')}
                      </Link>
                    )
                  : undefined
              }
            />
            <table className="hidden min-w-full text-sm md:table">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <th className="px-4 py-3">{t('adminOrg.colTitle')}</th>
                  <th className="px-4 py-3">{t('adminRbac.roleKeyField')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className={adminDenseRowClass()}>
                    <td className="px-4 py-3 font-medium text-foreground">{row.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.key || '—'}</td>
                    <td className="px-4 py-3">
                      {canUpdatePosition ? (
                        <Link
                          to={`${RBAC_POS_BASE}/roles?positionId=${encodeURIComponent(row.id)}`}
                          className={adminManageLinkClass()}
                        >
                          {t('adminDomains.rbac.assignPositionRoles')}
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
