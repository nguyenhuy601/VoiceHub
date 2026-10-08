/** Huy: Domain Cơ cấu tổ chức — admin Khối (division) */
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
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

const DIVISION_MANAGE_HUB = '/app/admin/org-structure/divisions/manage';

export default function DivisionListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { divisions, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId);
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canCreateDivision = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.DIVISION_CREATE);
  const canUpdateDivision = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.DIVISION_UPDATE);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return divisions;
    return divisions.filter((row) => {
      const id = unitId(row);
      return (
        unitName(row).toLowerCase().includes(q) ||
        String(row.branchName || '').toLowerCase().includes(q) ||
        id.toLowerCase().includes(q)
      );
    });
  }, [divisions, query]);

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.divisionList')}
      hint={t('adminOrg.divisionListHint')}
      wide
      actions={
        canCreateDivision ? (
          <Link to="/app/admin/org-structure/divisions/create" className={adminPrimaryBtnClass()}>
            <Plus className="h-4 w-4" />
            {t('adminDomains.orgStructure.divisionCreate')}
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
        {loading && !divisions.length ? (
          <AdminListSkeleton className="p-4" />
        ) : structureError ? (
          <AdminLoadErrorState className="px-4 py-6" message={structureError} onRetry={() => loadStructure()} />
        ) : (
          <AdminDenseTableScroll aria-busy={loading || undefined}>
            <AdminDenseMobileList
              items={filtered}
              getKey={unitId}
              ariaLabel={t('adminDomains.orgStructure.divisionList')}
              renderTitle={(row) => unitName(row)}
              renderMeta={(row) =>
                [
                  row.branchName || '—',
                  row.isActive !== false ? t('adminOrg.active') : t('adminOrg.inactive'),
                ].join(' · ')
              }
              renderActions={
                canUpdateDivision
                  ? (row) => (
                      <Link
                        to={adminOrgUnitHubLink(DIVISION_MANAGE_HUB, unitId(row), 'edit')}
                        className={adminManageLinkClass()}
                      >
                        {t('adminDomains.orgStructure.divisionManageHub')}
                      </Link>
                    )
                  : undefined
              }
            />
            <table className="hidden min-w-full text-sm md:table">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <th className="px-4 py-3">{t('adminOrg.colName')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colBranch')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colStatus')}</th>
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
                      <td className="px-4 py-3 text-muted-foreground">{row.branchName || '—'}</td>
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
                      <td className="px-4 py-3">
                        {canUpdateDivision ? (
                          <Link
                            to={adminOrgUnitHubLink(DIVISION_MANAGE_HUB, id, 'edit')}
                            className={adminManageLinkClass()}
                          >
                            {t('adminDomains.orgStructure.divisionManageHub')}
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
                message={t('adminOrg.noDivisions')}
                action={
                  canCreateDivision && !query.trim() ? (
                    <Link to="/app/admin/org-structure/divisions/create" className={adminPrimaryBtnClass()}>
                      <Plus className="h-4 w-4" aria-hidden />
                      {t('adminDomains.orgStructure.divisionCreate')}
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
