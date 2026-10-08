/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AdminDenseMobileList,
  AdminDenseTableCard,
  AdminDenseTableScroll,
  AdminUserPanelShell,
  adminDenseRowClass,
  adminInputClass,
  adminManageLinkClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';
import useAdminMembers from '../../hooks/useAdminMembers';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { useAppStrings } from '../../locales/appStrings';
import { adminOrgUnitHubLink } from '../../utils/adminHubLinks';
import { departmentHeadId, unitId, unitName } from '../../utils/adminOrgStructureUtils';
import { memberLabelById } from '../../utils/adminUserUtils';

const DEPT_MANAGE_HUB = '/app/admin/org-structure/departments/manage';

export default function DeptListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { departments, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId);
  const { membersByIdAll } = useAdminMembers(orgId);
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canCreateDept = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.DEPT_CREATE);
  const canUpdateDept = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.DEPT_UPDATE);
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
    if (!q) return departments;
    return departments.filter((row) => {
      const id = unitId(row);
      const headId = departmentHeadId(row);
      const headName = headId ? memberLabelById(membersByIdAll, headId, '') : '';
      return (
        unitName(row).toLowerCase().includes(q) ||
        String(row.divisionName || '').toLowerCase().includes(q) ||
        String(row.branchName || '').toLowerCase().includes(q) ||
        headName.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q)
      );
    });
  }, [departments, query, membersByIdAll]);

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.deptList')}
      hint={t('adminOrg.deptListHint')}
      wide
      actions={
        <>
          {canCreateDept ? (
            <Link to="/app/admin/org-structure/departments/create" className={adminPrimaryBtnClass()}>
              <Plus className="h-4 w-4" />
              {t('adminDomains.orgStructure.deptCreate')}
            </Link>
          ) : null}
          {canUpdateDept ? (
            <Link to={adminOrgUnitHubLink(DEPT_MANAGE_HUB, null, 'members')} className={adminSecondaryBtnClass()}>
              {t('adminDomains.orgStructure.deptManageHub')}
            </Link>
          ) : null}
          {canUpdateDept ? (
            <Link to="/app/admin/org-structure/departments/transfer" className={adminSecondaryBtnClass()}>
              {t('adminDomains.orgStructure.deptTransfer')}
            </Link>
          ) : null}
        </>
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
        {loading && !departments.length ? (
          <AdminListSkeleton className="p-4" />
        ) : structureError ? (
          <AdminLoadErrorState className="px-4 py-6" message={structureError} onRetry={() => loadStructure()} />
        ) : (
          <AdminDenseTableScroll aria-busy={loading || undefined}>
            <AdminDenseMobileList
              items={filtered}
              getKey={unitId}
              ariaLabel={t('adminDomains.orgStructure.deptList')}
              renderTitle={(row) => unitName(row)}
              renderMeta={(row) => {
                const headId = departmentHeadId(row);
                return [
                  row.divisionName || '—',
                  headId ? memberLabelById(membersByIdAll, headId) : '—',
                  `${t('adminOrg.colMembers')}: ${(row.memberIds || []).length}`,
                ].join(' · ');
              }}
              renderActions={
                canUpdateDept
                  ? (row) => (
                      <Link
                        to={adminOrgUnitHubLink(DEPT_MANAGE_HUB, unitId(row), 'members')}
                        className={adminManageLinkClass()}
                      >
                        {t('adminDomains.orgStructure.deptManageHub')}
                      </Link>
                    )
                  : undefined
              }
            />
            <table className="hidden min-w-full text-sm md:table">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <th className="px-4 py-3">{t('adminOrg.colName')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colDivision')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colHead')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colMembers')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const id = unitId(row);
                  const headId = departmentHeadId(row);
                  const headLabel = headId ? memberLabelById(membersByIdAll, headId) : '—';
                  return (
                    <tr key={id} className={adminDenseRowClass()}>
                      <td className="px-4 py-3 font-medium text-foreground">{unitName(row)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.divisionName || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{headLabel}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(row.memberIds || []).length}</td>
                      <td className="px-4 py-3">
                        {canUpdateDept ? (
                          <Link
                            to={adminOrgUnitHubLink(DEPT_MANAGE_HUB, id, 'members')}
                            className={adminManageLinkClass()}
                          >
                            {t('adminDomains.orgStructure.deptManageHub')}
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
                message={t('adminOrg.noDepartments')}
                action={
                  canCreateDept && !query.trim() ? (
                    <Link to="/app/admin/org-structure/departments/create" className={adminPrimaryBtnClass()}>
                      <Plus className="h-4 w-4" aria-hidden />
                      {t('adminDomains.orgStructure.deptCreate')}
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
