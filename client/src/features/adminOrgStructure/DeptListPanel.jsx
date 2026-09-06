/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AdminDenseTableCard,
    AdminDenseTableScroll,
    AdminUserPanelShell,
    adminInputClass,
    adminPrimaryBtnClass,
    adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
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
const ACTION_LINKS = [
  { tab: 'members', labelKey: 'adminDomains.orgStructure.deptMembers', grant: RBAC_GRANT.DEPT_UPDATE },
  { tab: 'edit', labelKey: 'adminDomains.orgStructure.deptEdit', grant: RBAC_GRANT.DEPT_UPDATE },
  { tab: 'head', labelKey: 'adminDomains.orgStructure.deptHead', grant: RBAC_GRANT.DEPT_UPDATE },
  { tab: 'org-roles', labelKey: 'adminDomains.orgStructure.deptOrgRoles', grant: RBAC_GRANT.DEPT_UPDATE },
  { tab: 'disable', labelKey: 'adminDomains.orgStructure.deptDisable', grant: RBAC_GRANT.DEPT_UPDATE },
];

export default function DeptListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { departments, loading, loadStructure } = useAdminOrgStructure(orgId);
  const { membersByIdAll } = useAdminMembers(orgId, { view: 'directory' });
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
              {t('adminDomains.orgStructure.deptMembers')}
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

      <AdminDenseTableCard>
        {loading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <AdminDenseTableScroll>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-muted/95 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <th className="px-4 py-3">{t('adminOrg.colName')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colDivision')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colBranch')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colTeams')}</th>
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
                    <tr key={id} className="border-b border-border/50 transition hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">{unitName(row)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.divisionName || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.branchName || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.teamCount ?? 0}</td>
                      <td className="px-4 py-3 text-muted-foreground">{headLabel}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(row.memberIds || []).length}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {ACTION_LINKS.filter((link) =>
                            canActWithGrant(isFullAccess, hasGrant, link.grant)
                          ).map((link) => (
                            <Link
                              key={link.tab}
                              to={adminOrgUnitHubLink(DEPT_MANAGE_HUB, id, link.tab)}
                              className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
                            >
                              {t(link.labelKey)}
                            </Link>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t('adminOrg.noDepartments')}
              </p>
            ) : null}
          </AdminDenseTableScroll>
        )}
      </AdminDenseTableCard>
    </AdminUserPanelShell>
  );
}
