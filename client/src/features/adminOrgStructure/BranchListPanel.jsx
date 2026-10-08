/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  AdminDenseMobileList,
  AdminDenseTableCard,
  AdminDenseTableScroll,
  AdminUserPanelShell,
  adminDenseRowClass,
  adminInputClass,
  adminManageLinkClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';
import { useAppStrings } from '../../locales/appStrings';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';
import { adminOrgUnitHubLink } from '../../utils/adminHubLinks';

const BRANCH_MANAGE_HUB = '/app/admin/org-structure/branches/manage';

export default function BranchListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { branches, loading, error: structureError, loadStructure } = useAdminOrgStructure(
    orgId,
    { includeInactive: true }
  );
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canCreateBranch = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.BRANCH_CREATE);
  const canUpdateBranch = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.BRANCH_UPDATE);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === 'hidden') return;
      loadStructure();
    };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [loadStructure]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((row) => {
      const id = unitId(row);
      return (
        unitName(row).toLowerCase().includes(q) ||
        String(row.location || '').toLowerCase().includes(q) ||
        id.toLowerCase().includes(q)
      );
    });
  }, [branches, query]);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.branchList')}
      hint={t('adminOrg.branchListHint')}
      wide
      actions={
        canCreateBranch ? (
          <Link to="/app/admin/org-structure/branches/create" className={adminPrimaryBtnClass()}>
            <Plus className="h-4 w-4" />
            {t('adminDomains.orgStructure.branchCreate')}
          </Link>
        ) : null
      }
    >
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
        {loading && !branches.length ? (
          <AdminListSkeleton className="p-4" />
        ) : structureError ? (
          <AdminLoadErrorState className="px-4 py-6" message={structureError} onRetry={() => loadStructure()} />
        ) : (
          <AdminDenseTableScroll aria-busy={loading || undefined}>
            <AdminDenseMobileList
              items={filtered}
              getKey={unitId}
              ariaLabel={t('adminDomains.orgStructure.branchList')}
              renderTitle={(row) => unitName(row)}
              renderMeta={(row) =>
                [
                  row.location || '—',
                  row.isActive !== false ? t('adminOrg.active') : t('adminOrg.inactive'),
                  formatDate(row.createdAt),
                ].join(' · ')
              }
              renderActions={
                canUpdateBranch
                  ? (row) => (
                      <Link
                        to={adminOrgUnitHubLink(BRANCH_MANAGE_HUB, unitId(row), 'edit')}
                        className={adminManageLinkClass()}
                      >
                        {t('adminDomains.orgStructure.branchManageHub')}
                      </Link>
                    )
                  : undefined
              }
            />
            <table className="hidden min-w-full text-sm md:table">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <th className="px-4 py-3">{t('adminOrg.colName')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colLocation')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colStatus')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colCreatedAt')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const id = unitId(row);
                  const active = row.isActive !== false;
                  return (
                    <tr key={id} className={adminDenseRowClass()}>
                      <td className="px-4 py-3 font-medium text-foreground">{unitName(row)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.location || '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            active
                              ? 'bg-success-bg text-success'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {active ? t('adminOrg.active') : t('adminOrg.inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-3">
                        {canUpdateBranch ? (
                          <Link
                            to={adminOrgUnitHubLink(BRANCH_MANAGE_HUB, id, 'edit')}
                            className={adminManageLinkClass()}
                          >
                            {t('adminDomains.orgStructure.branchManageHub')}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length ? (
              <AdminEmptyState
                message={t('adminOrg.noBranches')}
                action={
                  canCreateBranch && !query.trim() ? (
                    <Link to="/app/admin/org-structure/branches/create" className={adminPrimaryBtnClass()}>
                      <Plus className="h-4 w-4" aria-hidden />
                      {t('adminDomains.orgStructure.branchCreate')}
                    </Link>
                  ) : null
                }
              />
            ) : null}
          </AdminDenseTableScroll>
        )}
      </AdminDenseTableCard>
    </AdminUserPanelShell>
  );
}
