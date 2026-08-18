/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  AdminUserPanelShell,
  adminInputClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { teamLeaderId, unitId, unitName } from '../../utils/adminOrgStructureUtils';
import { memberLabelById } from '../../utils/adminUserUtils';
import { adminOrgUnitHubLink } from '../../utils/adminHubLinks';

const TEAM_MANAGE_HUB = '/app/admin/org-structure/teams/manage';
const ACTION_LINKS = [
  { tab: 'edit', labelKey: 'adminDomains.orgStructure.teamEdit' },
  { tab: 'members', labelKey: 'adminDomains.orgStructure.teamMembers' },
  { tab: 'leader', labelKey: 'adminDomains.orgStructure.teamLeader' },
  { tab: 'archive', labelKey: 'adminDomains.orgStructure.teamArchive' },
];

export default function TeamListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { teams, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId);
  const { membersByIdAll } = useAdminMembers(orgId);
  const { isFullAccess, isOrgOwnerOrAdmin } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canCreateTeam = canActWithGrant(isOrgOwnerOrAdmin, hasGrant, RBAC_GRANT.TEAM_CREATE);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((row) => {
      const id = unitId(row);
      const leaderId = teamLeaderId(row);
      const leaderName = leaderId ? memberLabelById(membersByIdAll, leaderId, '') : '';
      return (
        unitName(row).toLowerCase().includes(q) ||
        String(row.departmentName || '').toLowerCase().includes(q) ||
        leaderName.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q)
      );
    });
  }, [teams, query, membersByIdAll]);

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.teamList')}
      hint={t('adminOrg.teamListHint')}
      wide
      actions={
        canCreateTeam ? (
          <Link to="/app/admin/org-structure/teams/create" className={adminPrimaryBtnClass()}>
            <Plus className="h-4 w-4" />
            {t('adminDomains.orgStructure.teamCreate')}
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
                  <th className="px-4 py-3">{t('adminOrg.colDepartment')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colLeader')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colMembers')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colStatus')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const id = unitId(row);
                  const leaderId = teamLeaderId(row);
                  const leaderLabel = leaderId ? memberLabelById(membersByIdAll, leaderId) : '—';
                  const active = row.isActive !== false;
                  return (
                    <tr key={id} className="border-b border-border/50 transition hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">{unitName(row)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.departmentName || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{leaderLabel}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {(row.memberIds || []).length}
                      </td>
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
                              to={adminOrgUnitHubLink(TEAM_MANAGE_HUB, id, link.tab)}
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
                {t('adminOrg.noTeams')}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </AdminUserPanelShell>
  );
}
