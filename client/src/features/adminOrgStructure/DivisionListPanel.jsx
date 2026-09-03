/** Huy: Domain Cơ cấu tổ chức — admin Khối (division) */
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  AdminUserPanelShell,
  adminInputClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';
import { useAppStrings } from '../../locales/appStrings';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';
import { adminOrgUnitHubLink } from '../../utils/adminHubLinks';

const DIVISION_MANAGE_HUB = '/app/admin/org-structure/divisions/manage';
const ACTION_LINKS = [
  { tab: 'edit', labelKey: 'adminDomains.orgStructure.divisionEdit', grant: RBAC_GRANT.DIVISION_UPDATE },
  { tab: 'disable', labelKey: 'adminDomains.orgStructure.divisionDisable', grant: RBAC_GRANT.DIVISION_UPDATE },
  { tab: 'departments', labelKey: 'adminDomains.orgStructure.divisionDept', grant: RBAC_GRANT.DIVISION_UPDATE },
];

export default function DivisionListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { divisions, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId);
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canCreateDivision = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.DIVISION_CREATE);
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
        ) : structureError ? (
          <div className="space-y-3 px-4 py-6">
            <p className="text-sm text-destructive">{structureError}</p>
            <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadStructure()}>
              {t('adminRbac.retry')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="sticky top-0 border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                    <tr key={id} className="border-b border-border/50 transition hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">{unitName(row)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.branchName || '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            active
                              ? 'bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300'
                              : 'bg-slate-500/12 text-slate-700 ring-1 ring-slate-500/20 dark:text-slate-300'
                          }`}
                        >
                          {active ? t('adminOrg.active') : t('adminOrg.inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {ACTION_LINKS.filter((link) =>
                            canActWithGrant(isFullAccess, hasGrant, link.grant)
                          ).map((link) => (
                            <Link
                              key={link.tab}
                              to={adminOrgUnitHubLink(DIVISION_MANAGE_HUB, id, link.tab)}
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
                {t('adminOrg.noDivisions')}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </AdminUserPanelShell>
  );
}
