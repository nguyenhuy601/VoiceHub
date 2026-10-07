import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';
import {
  departmentHeadId,
  teamLeaderId,
  unitId,
  unitName,
} from '../../utils/adminOrgStructureUtils';
import {
  ORGANIZATION_ROLE_KEYS,
  ORGANIZATION_ROLE_LABELS,
  ROLE_KIND,
} from '../../utils/roleTaxonomy';

function resolveOrgRolesForUser(userId, departments, teams) {
  const uid = String(userId || '').trim();
  if (!uid) return [];

  const roles = [];
  for (const dept of departments) {
    if (departmentHeadId(dept) !== uid) continue;
    roles.push({
      id: `dept-${unitId(dept)}`,
      roleKey: ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER,
      scopeType: 'department',
      scopeName: unitName(dept),
      editPath: `/app/admin/org-structure/departments/head?unitId=${encodeURIComponent(unitId(dept))}&userId=${encodeURIComponent(uid)}`,
    });
  }
  for (const team of teams) {
    if (teamLeaderId(team) !== uid) continue;
    roles.push({
      id: `team-${unitId(team)}`,
      roleKey: ORGANIZATION_ROLE_KEYS.TEAM_MANAGER,
      scopeType: 'team',
      scopeName: unitName(team),
      editPath: `/app/admin/org-structure/teams/leader?unitId=${encodeURIComponent(unitId(team))}&userId=${encodeURIComponent(uid)}`,
    });
  }
  return roles;
}

export default function RbacOrgRoleLookupPanel({ orgId }) {
  const { t } = useAppStrings();
  const { departments, teams, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId);
  const [userId, setUserId] = useState('');
  const [manualAssignments, setManualAssignments] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!orgId) return undefined;
    setAssignError('');
    if (!userId) {
      setManualAssignments([]);
      return undefined;
    }
    let cancelled = false;
    setAssignLoading(true);
    orgRoleCatalogAPI
      .listAssignments(orgId, { userId })
      .then((res) => {
        if (!cancelled) setManualAssignments(res?.data?.assignments || []);
      })
      .catch((error) => {
        if (cancelled) return;
        setManualAssignments([]);
        setAssignError(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.lookupLoadFail') }));
      })
      .finally(() => {
        if (!cancelled) setAssignLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, t, reloadTick]);

  const scopeTypeLabel = (scopeType) => {
    if (scopeType === 'department') return t('adminRbac.lookupScopeDepartment');
    if (scopeType === 'team') return t('adminRbac.lookupScopeTeam');
    return t('adminRbac.lookupScopeCompany');
  };

  const roles = useMemo(
    () => {
      const autoRoles = resolveOrgRolesForUser(userId, departments, teams);
      const customRoles = (manualAssignments || []).map((a) => ({
        id: `custom-${String(a.roleKey || '').trim()}-${String(a.userId || '').trim()}`,
        roleKey: a.roleKey,
        roleLabel: a.roleLabel,
        scopeType: 'org',
        scopeName: t('adminRbac.lookupScopeCompany'),
        editPath: `/app/admin/rbac/org-roles/assign?userId=${encodeURIComponent(
          String(a.userId || '').trim()
        )}&roleKey=${encodeURIComponent(String(a.roleKey || '').trim())}`,
      }));
      return [...autoRoles, ...customRoles];
    },
    [userId, departments, teams, manualAssignments, t]
  );

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.orgRoleLookup')}
      hint={t('adminRbac.orgRoleLookupHint')}
    >
      <AdminUserFormCard title={t('adminRbac.orgRoleLookupPickUser')}>
        <AdminUserPicker orgId={orgId} selectedUserId={userId} onSelect={setUserId} />
      </AdminUserFormCard>

      <AdminUserFormCard title={t('adminRbac.orgRoleLookupResult')}>
        {structureError || assignError ? (
          <AdminLoadErrorState
            message={structureError || assignError}
            onRetry={() => {
              if (structureError) loadStructure();
              setReloadTick((n) => n + 1);
            }}
          />
        ) : loading || assignLoading ? (
          <AdminListSkeleton rows={3} />
        ) : !userId ? (
          <p className="text-sm text-muted-foreground">{t('adminRbac.orgRoleLookupNeedUser')}</p>
        ) : !roles.length ? (
          <AdminEmptyState message={t('adminRbac.orgRoleLookupEmpty')} />
        ) : (
          <ul className="divide-y divide-border">
            {roles.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <span className="font-medium">
                    {row.roleLabel || ORGANIZATION_ROLE_LABELS[row.roleKey] || row.roleKey}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {row.roleKey} · {ROLE_KIND.ORGANIZATION}
                  </span>
                  <p className="text-muted-foreground">
                    {scopeTypeLabel(row.scopeType)}: {row.scopeName}
                  </p>
                </div>
                <Link to={row.editPath} className={adminSecondaryBtnClass('text-xs')}>
                  {t('adminRbac.orgRoleOpenScope')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
