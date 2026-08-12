import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminMembers from '../../hooks/useAdminMembers';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import { useAppStrings } from '../../locales/appStrings';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';
import {
  departmentHeadId,
  teamLeaderId,
  unitId,
  unitName,
} from '../../utils/adminOrgStructureUtils';
import { memberLabelById } from '../../utils/adminUserUtils';
import {
  ORGANIZATION_ROLE_KEYS,
  ORGANIZATION_ROLE_LABELS,
  ROLE_KIND,
} from '../../utils/roleTaxonomy';

export default function RbacOrgRoleDirectoryPanel({ orgId }) {
  const { t } = useAppStrings();
  const { departments, teams, loading: structureLoading } = useAdminOrgStructure(orgId);
  const { membersByIdAll, loading: membersLoading } = useAdminMembers(orgId);
  const [query, setQuery] = useState('');
  const [manualAssignments, setManualAssignments] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let mounted = true;
    setAssignLoading(true);
    orgRoleCatalogAPI
      .listAssignments(orgId)
      .then((res) => {
        const items = res?.data?.assignments || [];
        if (mounted) setManualAssignments(items);
      })
      .catch(() => {
        if (mounted) setManualAssignments([]);
      })
      .finally(() => {
        if (mounted) setAssignLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [orgId]);

  const rows = useMemo(() => {
    const list = [];
    for (const dept of departments) {
      const headId = departmentHeadId(dept);
      if (!headId) continue;
      list.push({
        id: `dept-${unitId(dept)}`,
        roleKey: ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER,
        scopeType: 'department',
        scopeName: unitName(dept),
        unitId: unitId(dept),
        userId: headId,
        editPath: `/app/admin/org-structure/departments/head?unitId=${encodeURIComponent(unitId(dept))}`,
      });
    }
    for (const team of teams) {
      const leaderId = teamLeaderId(team);
      if (!leaderId) continue;
      list.push({
        id: `team-${unitId(team)}`,
        roleKey: ORGANIZATION_ROLE_KEYS.TEAM_MANAGER,
        scopeType: 'team',
        scopeName: unitName(team),
        unitId: unitId(team),
        userId: leaderId,
        editPath: `/app/admin/org-structure/teams/leader?unitId=${encodeURIComponent(unitId(team))}`,
      });
    }

    // Custom roles assigned manually by admin (org-wide scope for now).
    for (const a of manualAssignments) {
      const roleKey = String(a.roleKey || '').trim();
      const userId = String(a.userId || '').trim();
      if (!roleKey || !userId) continue;
      list.push({
        id: `custom-${roleKey}-${userId}`,
        roleKey,
        roleLabel: a.roleLabel,
        scopeType: 'org',
        scopeName: 'Company',
        userId,
        editPath: `/app/admin/rbac/org-roles/assign?userId=${encodeURIComponent(userId)}&roleKey=${encodeURIComponent(roleKey)}`,
      });
    }
    return list.sort((a, b) => a.scopeName.localeCompare(b.scopeName));
  }, [departments, teams, manualAssignments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const holder = memberLabelById(membersByIdAll, row.userId, row.userId).toLowerCase();
      return (
        row.scopeName.toLowerCase().includes(q) ||
        holder.includes(q) ||
        row.roleKey.toLowerCase().includes(q)
      );
    });
  }, [rows, query, membersByIdAll]);

  const loading = structureLoading || membersLoading || assignLoading;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.orgRoleDirectory')}
      hint={t('adminRbac.orgRoleDirectoryHint')}
      wide
    >
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {t('adminRbac.orgRoleCatalogResolve')}
      </p>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('adminRbac.orgRoleDirectorySearch')}
            className={`${adminInputClass()} pl-9`}
          />
        </div>
      </div>

      <AdminUserFormCard title={t('adminDomains.rbac.orgRoleDirectory')}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">{t('adminRbac.orgRoleColRole')}</th>
                  <th className="px-3 py-2">{t('adminRbac.orgRoleColScope')}</th>
                  <th className="px-3 py-2">{t('adminRbac.orgRoleColHolder')}</th>
                  <th className="px-3 py-2">{t('adminOrg.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="px-3 py-2">
                      <span className="font-medium">
                        {row.roleLabel || ORGANIZATION_ROLE_LABELS[row.roleKey] || row.roleKey}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {row.roleKey} · {ROLE_KIND.ORGANIZATION}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.scopeType}: {row.scopeName}
                    </td>
                    <td className="px-3 py-2">
                      {memberLabelById(membersByIdAll, row.userId, row.userId)}
                    </td>
                    <td className="px-3 py-2">
                      <Link to={row.editPath} className={adminSecondaryBtnClass('!px-2 !py-1 text-xs')}>
                        {t('adminRbac.orgRoleEditAssignment')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('adminRbac.orgRoleDirectoryEmpty')}
              </p>
            ) : null}
          </div>
        )}
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
