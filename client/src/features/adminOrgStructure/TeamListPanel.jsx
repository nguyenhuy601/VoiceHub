/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { teamLeaderId, unitId, unitName } from '../../utils/adminOrgStructureUtils';
import { memberLabelById } from '../../utils/adminUserUtils';

const TEAM_MANAGE_HUB = '/app/admin/org-structure/teams/manage';

export default function TeamListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { teams, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId);
  const { membersByIdAll } = useAdminMembers(orgId);
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canCreateTeam = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.TEAM_CREATE);
  const canUpdateTeam = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.TEAM_UPDATE);
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
        {loading && !teams.length ? (
          <AdminListSkeleton className="p-4" />
        ) : structureError ? (
          <AdminLoadErrorState className="px-4 py-6" message={structureError} onRetry={() => loadStructure()} />
        ) : (
          <AdminDenseTableScroll aria-busy={loading || undefined}>
            <AdminDenseMobileList
              items={filtered}
              getKey={unitId}
              ariaLabel={t('adminDomains.orgStructure.teamList')}
              renderTitle={(row) => unitName(row)}
              renderMeta={(row) => {
                const leaderId = teamLeaderId(row);
                return [
                  row.departmentName || '—',
                  leaderId ? memberLabelById(membersByIdAll, leaderId) : '—',
                  `${t('adminOrg.colMembers')}: ${(row.memberIds || []).length}`,
                ].join(' · ');
              }}
              renderActions={
                canUpdateTeam
                  ? (row) => (
                      <Link
                        to={adminOrgUnitHubLink(TEAM_MANAGE_HUB, unitId(row), 'members')}
                        className={adminManageLinkClass()}
                      >
                        {t('adminDomains.orgStructure.teamManageHub')}
                      </Link>
                    )
                  : undefined
              }
            />
            <table className="hidden min-w-full text-sm md:table">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <th className="px-4 py-3">{t('adminOrg.colName')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colDepartment')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colLeader')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colMembers')}</th>
                  <th className="px-4 py-3">{t('adminOrg.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const id = unitId(row);
                  const leaderId = teamLeaderId(row);
                  const leaderLabel = leaderId ? memberLabelById(membersByIdAll, leaderId) : '—';
                  return (
                    <tr key={id} className={adminDenseRowClass()}>
                      <td className="px-4 py-3 font-medium text-foreground">{unitName(row)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.departmentName || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{leaderLabel}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {(row.memberIds || []).length}
                      </td>
                      <td className="px-4 py-3">
                        {canUpdateTeam ? (
                          <Link
                            to={adminOrgUnitHubLink(TEAM_MANAGE_HUB, id, 'members')}
                            className={adminManageLinkClass()}
                          >
                            {t('adminDomains.orgStructure.teamManageHub')}
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
                message={t('adminOrg.noTeams')}
                action={
                  canCreateTeam && !query.trim() ? (
                    <Link to="/app/admin/org-structure/teams/create" className={adminPrimaryBtnClass()}>
                      <Plus className="h-4 w-4" aria-hidden />
                      {t('adminDomains.orgStructure.teamCreate')}
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
