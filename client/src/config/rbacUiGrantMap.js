/**
 * Map UI (admin nav / hành vi org-structure) → master permission V2.
 * Owner/admin/systemAdmin bypass — HR/member cần đúng grant.
 */

export const RBAC_GRANT = {
  TEAM_VIEW: 'organization.team.view',
  TEAM_CREATE: 'organization.team.create',
  TEAM_UPDATE: 'organization.team.update',
  TEAM_DELETE: 'organization.team.delete',
  DEPT_VIEW: 'organization.department.view',
  DEPT_CREATE: 'organization.department.create',
  DEPT_UPDATE: 'organization.department.update',
  DEPT_DELETE: 'organization.department.delete',
  BRANCH_VIEW: 'organization.branch.view',
  BRANCH_CREATE: 'organization.branch.create',
  BRANCH_UPDATE: 'organization.branch.update',
  BRANCH_DELETE: 'organization.branch.delete',
  DIVISION_VIEW: 'organization.division.view',
  DIVISION_CREATE: 'organization.division.create',
  DIVISION_UPDATE: 'organization.division.update',
  DIVISION_DELETE: 'organization.division.delete',
  STRUCTURE_VIEW: 'organization.structure.view',
  STRUCTURE_UPDATE: 'organization.structure.update',
  EMPLOYEE_VIEW: 'organization.employee.view',
  EMPLOYEE_INVITE: 'organization.employee.invite',
  EMPLOYEE_UPDATE: 'organization.employee.update',
  EMPLOYEE_DISABLE: 'organization.employee.disable',
  EMPLOYEE_DELETE: 'organization.employee.delete',
  EMPLOYEE_RESET_PASSWORD: 'organization.employee.reset_password',
  POSITION_VIEW: 'organization.position.view',
  POSITION_CREATE: 'organization.position.create',
  POSITION_UPDATE: 'organization.position.update',
  POSITION_DELETE: 'organization.position.delete',
  ORG_ROLE_VIEW: 'organization.organization_role.view',
  ORG_ROLE_UPDATE: 'organization.organization_role.update',
  MASTER_DATA_VIEW: 'organization.master_data.view',
  MASTER_DATA_UPDATE: 'organization.master_data.update',
  POLICY_VIEW: 'organization.policy.view',
  POLICY_UPDATE: 'organization.policy.update',
  PERM_GROUP_VIEW: 'system.permission_group.view',
  PERM_GROUP_CLONE: 'system.permission_group.clone',
  PERM_GROUP_UPDATE_GRANT: 'system.permission_group.update_grant',
  PERM_GROUP_ASSIGN: 'system.permission_group.assign',
  CHANNEL_VIEW: 'communication.channel.view',
  CHANNEL_CREATE: 'communication.channel.create',
  CHANNEL_UPDATE: 'communication.channel.update',
  CHANNEL_DELETE: 'communication.channel.delete',
  SKILL_REGISTRY_REVIEW: 'organization.skill_registry.review',
  SKILL_REGISTRY_VIEW: 'organization.skill_registry.view',
};

/** nav item id → master key (fallback nếu config chưa gắn requiredGrant). */
export const ADMIN_NAV_REQUIRED_GRANT = {
  'team-create': RBAC_GRANT.TEAM_CREATE,
  'team-edit': RBAC_GRANT.TEAM_UPDATE,
  'team-archive': RBAC_GRANT.TEAM_UPDATE,
  'team-dept': RBAC_GRANT.TEAM_UPDATE,
  'team-members': RBAC_GRANT.TEAM_UPDATE,
  'team-leader': RBAC_GRANT.TEAM_UPDATE,
  'team-list': RBAC_GRANT.TEAM_VIEW,
  'team-manage': RBAC_GRANT.TEAM_VIEW,
  'dept-create': RBAC_GRANT.DEPT_CREATE,
  'dept-edit': RBAC_GRANT.DEPT_UPDATE,
  'dept-disable': RBAC_GRANT.DEPT_UPDATE,
  'dept-parent': RBAC_GRANT.DEPT_UPDATE,
  'dept-head': RBAC_GRANT.DEPT_UPDATE,
  'dept-members': RBAC_GRANT.DEPT_UPDATE,
  'dept-org-roles': RBAC_GRANT.DEPT_UPDATE,
  'dept-transfer': RBAC_GRANT.DEPT_UPDATE,
  'dept-list': RBAC_GRANT.DEPT_VIEW,
  'dept-manage': RBAC_GRANT.DEPT_VIEW,
  'branch-create': RBAC_GRANT.BRANCH_CREATE,
  'branch-edit': RBAC_GRANT.BRANCH_UPDATE,
  'branch-disable': RBAC_GRANT.BRANCH_UPDATE,
  'branch-list': RBAC_GRANT.BRANCH_VIEW,
  'branch-manage': RBAC_GRANT.BRANCH_VIEW,
  'division-create': RBAC_GRANT.DIVISION_CREATE,
  'division-edit': RBAC_GRANT.DIVISION_UPDATE,
  'division-disable': RBAC_GRANT.DIVISION_UPDATE,
  'division-list': RBAC_GRANT.DIVISION_VIEW,
  'division-manage': RBAC_GRANT.DIVISION_VIEW,
  'channel-manage': RBAC_GRANT.CHANNEL_UPDATE,
  levels: RBAC_GRANT.STRUCTURE_VIEW,
  'unit-tree': RBAC_GRANT.STRUCTURE_VIEW,
  'people-ops': RBAC_GRANT.EMPLOYEE_UPDATE,
  'assign-org': RBAC_GRANT.EMPLOYEE_UPDATE,
  'password-hub': RBAC_GRANT.EMPLOYEE_RESET_PASSWORD,
  'access-hub': RBAC_GRANT.EMPLOYEE_DISABLE,
  'verification-hub': RBAC_GRANT.EMPLOYEE_UPDATE,
  'login-history': RBAC_GRANT.EMPLOYEE_VIEW,
  'resend-verification': RBAC_GRANT.EMPLOYEE_UPDATE,
  activate: RBAC_GRANT.EMPLOYEE_UPDATE,
  'reset-password': RBAC_GRANT.EMPLOYEE_RESET_PASSWORD,
  'force-password': RBAC_GRANT.EMPLOYEE_RESET_PASSWORD,
  'set-password': RBAC_GRANT.EMPLOYEE_RESET_PASSWORD,
  'revoke-sessions': RBAC_GRANT.EMPLOYEE_DISABLE,
  lock: RBAC_GRANT.EMPLOYEE_DISABLE,
  taxonomy: RBAC_GRANT.PERM_GROUP_VIEW,
  'master-data': RBAC_GRANT.MASTER_DATA_VIEW,
  'pos-list': RBAC_GRANT.POSITION_VIEW,
  'pos-manage': RBAC_GRANT.POSITION_VIEW,
  'pos-assign': RBAC_GRANT.EMPLOYEE_UPDATE,
  'pos-edit': RBAC_GRANT.POSITION_UPDATE,
  'pos-disable': RBAC_GRANT.POSITION_UPDATE,
  'org-role-list': RBAC_GRANT.ORG_ROLE_VIEW,
  'org-role-create': RBAC_GRANT.ORG_ROLE_UPDATE,
  'org-role-directory': RBAC_GRANT.ORG_ROLE_VIEW,
  'org-role-lookup': RBAC_GRANT.ORG_ROLE_VIEW,
  'org-role-manage': RBAC_GRANT.ORG_ROLE_VIEW,
  'org-role-edit': RBAC_GRANT.ORG_ROLE_UPDATE,
  'org-role-assign': RBAC_GRANT.ORG_ROLE_UPDATE,
  'org-role-delete': RBAC_GRANT.ORG_ROLE_UPDATE,
  roles: RBAC_GRANT.PERM_GROUP_VIEW,
  permissions: RBAC_GRANT.PERM_GROUP_UPDATE_GRANT,
  hierarchy: RBAC_GRANT.PERM_GROUP_VIEW,
  matrix: RBAC_GRANT.PERM_GROUP_VIEW,
  'perm-pack-manage': RBAC_GRANT.PERM_GROUP_VIEW,
  assign: RBAC_GRANT.PERM_GROUP_ASSIGN,
  revoke: RBAC_GRANT.PERM_GROUP_ASSIGN,
};

function normalizeGrantKey(value) {
  return String(value || '').trim().toLowerCase();
}

function deriveGrantsFromPermissions(permissions = []) {
  const out = new Set();
  const rows = Array.isArray(permissions) ? permissions : [];

  const mapResourceActionToGrant = (resourceRaw, actionRaw) => {
    const resource = normalizeGrantKey(resourceRaw);
    const action = normalizeGrantKey(actionRaw);
    if (!resource || !action) return '';
    if (resource === 'organization.team' || resource === 'team') {
      if (action === 'view' || action === 'read') return RBAC_GRANT.TEAM_VIEW;
      if (action === 'create' || action === 'write') return RBAC_GRANT.TEAM_CREATE;
      if (action === 'update' || action === 'edit') return RBAC_GRANT.TEAM_UPDATE;
      if (action === 'delete' || action === 'remove') return RBAC_GRANT.TEAM_DELETE;
    }
    if (resource === 'organization.department') {
      if (action === 'view' || action === 'read') return RBAC_GRANT.DEPT_VIEW;
      if (action === 'create' || action === 'write') return RBAC_GRANT.DEPT_CREATE;
      if (action === 'update' || action === 'edit') return RBAC_GRANT.DEPT_UPDATE;
      if (action === 'delete' || action === 'remove') return RBAC_GRANT.DEPT_DELETE;
    }
    if (resource === 'communication.channel') {
      if (action === 'view' || action === 'read') return RBAC_GRANT.CHANNEL_VIEW;
      if (action === 'create' || action === 'write') return RBAC_GRANT.CHANNEL_CREATE;
      if (action === 'update' || action === 'edit') return RBAC_GRANT.CHANNEL_UPDATE;
      if (action === 'delete' || action === 'remove') return RBAC_GRANT.CHANNEL_DELETE;
    }
    return '';
  };

  for (const row of rows) {
    const directKeyCandidates = [
      row?.grant,
      row?.masterGrant,
      row?.key,
      row?.permission,
      row?.permissionKey,
      row?.code,
    ];
    for (const candidate of directKeyCandidates) {
      const key = normalizeGrantKey(candidate);
      if (key) out.add(key);
    }

    if (typeof row === 'string') {
      const key = normalizeGrantKey(row);
      if (key) out.add(key);
      continue;
    }

    const resource = row?.resource || row?.module || row?.scope;
    const actions = Array.isArray(row?.actions)
      ? row.actions
      : row?.action != null
        ? [row.action]
        : [];
    for (const action of actions) {
      const mapped = mapResourceActionToGrant(resource, action);
      if (mapped) out.add(mapped);
    }
  }

  return Array.from(out);
}

export function parseUserPermissionsPayload(res) {
  const root = res ?? {};
  const body = root?.data ?? root ?? {};
  const nested = body?.data ?? {};

  const permissions = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.permissions)
      ? body.permissions
      : Array.isArray(nested?.data)
        ? nested.data
        : Array.isArray(nested?.permissions)
          ? nested.permissions
          : Array.isArray(body)
            ? body
            : [];

  const masterGrantsRaw = Array.isArray(body?.masterGrants)
    ? body.masterGrants
    : Array.isArray(nested?.masterGrants)
      ? nested.masterGrants
      : Array.isArray(root?.masterGrants)
        ? root.masterGrants
        : [];
  const masterGrants = masterGrantsRaw
    .map((k) => normalizeGrantKey(k))
    .filter(Boolean);
  const derived = deriveGrantsFromPermissions(permissions);
  const mergedGrants = Array.from(new Set([...masterGrants, ...derived]));

  return { permissions, masterGrants: mergedGrants };
}

export function canActWithGrant(isFullAccess, hasGrantFn, key) {
  if (isFullAccess) return true;
  const grantKey = String(key || '').trim();
  if (!grantKey) return false;
  return typeof hasGrantFn === 'function' ? Boolean(hasGrantFn(grantKey)) : false;
}

export function navItemRequiredGrant(item) {
  const fromItem = String(item?.requiredGrant || '').trim();
  if (fromItem) return fromItem;
  return ADMIN_NAV_REQUIRED_GRANT[String(item?.id || '').trim()] || '';
}

export function navItemIsAllowed(item, { isFullAccess, hasGrant } = {}) {
  if (isFullAccess) return true;
  const key = navItemRequiredGrant(item);
  if (!key) return true;
  return typeof hasGrant === 'function' ? Boolean(hasGrant(key)) : false;
}

export function filterAdminNavItemsByGrant(items, ctx) {
  return (Array.isArray(items) ? items : []).filter((item) => navItemIsAllowed(item, ctx));
}

export function filterAdminDomainByGrant(domain, ctx) {
  if (!domain) return domain;
  return {
    ...domain,
    sections: (domain.sections || []).map((section) => ({
      ...section,
      items: filterAdminNavItemsByGrant(section.items, ctx),
    })),
  };
}
