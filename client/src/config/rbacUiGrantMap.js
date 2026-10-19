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
  PROJECT_VIEW: 'project.project.view',
  PROJECT_UPDATE: 'project.project.update',
  TASK_VIEW: 'project.task.view',
  SPRINT_VIEW: 'project.sprint.view',
  WORKFLOW_VIEW: 'project.workflow.view',
  WORKFLOW_UPDATE: 'project.workflow.update',
  BACKLOG_VIEW: 'project.backlog.view',
  REPORT_VIEW: 'project.report.view',
  CR_VIEW: 'project.change_request.view',
  AUDIT_VIEW: 'system.audit.view',
  MEETING_VIEW: 'meeting.meeting.view',
  MEETING_END: 'meeting.meeting.end',
  MEETING_RECORDING: 'meeting.meeting.view_recording',
  FILE_DOWNLOAD: 'file.file.download',
  CHAT_VIEW: 'communication.chat.view',
  NOTIF_VIEW: 'notification.notification.view',
  NOTIF_SEND: 'notification.notification.send',
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
  import: RBAC_GRANT.EMPLOYEE_INVITE,
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
  'pos-create': RBAC_GRANT.POSITION_CREATE,
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
  'project-role-list': RBAC_GRANT.MASTER_DATA_VIEW,
  'project-role-board': RBAC_GRANT.MASTER_DATA_VIEW,
  'project-role-manage': RBAC_GRANT.MASTER_DATA_VIEW,
  'project-role-create': RBAC_GRANT.MASTER_DATA_UPDATE,
  'project-role-edit': RBAC_GRANT.MASTER_DATA_UPDATE,
  'project-role-delete': RBAC_GRANT.MASTER_DATA_UPDATE,
  overview: RBAC_GRANT.PROJECT_VIEW,
  'project-team': RBAC_GRANT.PROJECT_UPDATE,
  delegation: RBAC_GRANT.PROJECT_UPDATE,
  boards: RBAC_GRANT.TASK_VIEW,
  workflow: RBAC_GRANT.WORKFLOW_VIEW,
  sprints: RBAC_GRANT.SPRINT_VIEW,
  'manage-tasks': RBAC_GRANT.TASK_VIEW,
  'change-requests': RBAC_GRANT.CR_VIEW,
  briefs: RBAC_GRANT.BACKLOG_VIEW,
  requirements: RBAC_GRANT.BACKLOG_VIEW,
  status: RBAC_GRANT.WORKFLOW_UPDATE,
  labels: RBAC_GRANT.WORKFLOW_UPDATE,
  transfer: RBAC_GRANT.PROJECT_UPDATE,
  policies: RBAC_GRANT.POLICY_VIEW,
  capacity: RBAC_GRANT.REPORT_VIEW,
  planner: RBAC_GRANT.REPORT_VIEW,
  utilization: RBAC_GRANT.REPORT_VIEW,
  performance: RBAC_GRANT.REPORT_VIEW,
  'approval-policies': RBAC_GRANT.POLICY_UPDATE,
  rooms: RBAC_GRANT.MEETING_VIEW,
  'manage-rooms': RBAC_GRANT.MEETING_VIEW,
  meetings: RBAC_GRANT.MEETING_VIEW,
  history: RBAC_GRANT.MEETING_RECORDING,
  'meeting-ops': RBAC_GRANT.MEETING_VIEW,
  moderate: RBAC_GRANT.MEETING_END,
  'end-meeting': RBAC_GRANT.MEETING_END,
  'settings-hub': RBAC_GRANT.POLICY_VIEW,
  'sessions-hub': RBAC_GRANT.EMPLOYEE_VIEW,
  'password-policy': RBAC_GRANT.POLICY_UPDATE,
  mfa: RBAC_GRANT.POLICY_UPDATE,
  'ip-whitelist': RBAC_GRANT.POLICY_UPDATE,
  log: RBAC_GRANT.AUDIT_VIEW,
  search: RBAC_GRANT.AUDIT_VIEW,
  login: RBAC_GRANT.AUDIT_VIEW,
  activity: RBAC_GRANT.AUDIT_VIEW,
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

  const rawScopes =
    (body?.grantScopes && typeof body.grantScopes === 'object' && !Array.isArray(body.grantScopes)
      ? body.grantScopes
      : null) ||
    (nested?.grantScopes && typeof nested.grantScopes === 'object' && !Array.isArray(nested.grantScopes)
      ? nested.grantScopes
      : null) ||
    (root?.grantScopes && typeof root.grantScopes === 'object' && !Array.isArray(root.grantScopes)
      ? root.grantScopes
      : null) ||
    {};
  const grantScopes = {};
  for (const [code, scope] of Object.entries(rawScopes)) {
    const key = normalizeGrantKey(code);
    if (!key) continue;
    grantScopes[key] = String(scope || 'ORGANIZATION').trim().toUpperCase();
  }

  // Response cũ chỉ có masterGrants (mảng mã), data là {resource, actions}.
  const codeLists = [root?.masterGrants, !Array.isArray(body) ? body?.masterGrants : null];
  for (const list of codeLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const key = normalizeGrantKey(
        typeof item === 'string' ? item : item?.key || item?.code || item?.permissionCode
      );
      if (!key || !key.includes('.')) continue;
      if (!grantScopes[key]) grantScopes[key] = 'ORGANIZATION';
    }
  }

  return { permissions, grantScopes };
}

/**
 * CTA / form gate — cùng SoT với sidebar/route (`navItemIsAllowed`).
 * Nhà cung cấp (isSystemAdmin) chỉ bypass khóa OPERATOR_MAINTAIN (+ path backup/project-roles).
 */
export function canActAdmin(requiredGrant, { hasGrant, scopeOf, isSystemAdmin = false } = {}) {
  const grantKey = String(requiredGrant || '').trim();
  if (!grantKey) return false;
  return navItemIsAllowed(
    { requiredGrant: grantKey, path: '', id: '' },
    { hasGrant, scopeOf, isSystemAdmin: Boolean(isSystemAdmin) }
  );
}

/**
 * @deprecated Prefer canActAdmin / useAdminActionGate — thiếu maintain bypass & scopeOf.
 * Giữ chữ ký cũ: nếu có grant thì giả định scope ORGANIZATION (trang admin đã vào).
 */
export function canActWithGrant(_unusedFullAccess, hasGrantFn, key) {
  return canActAdmin(key, {
    hasGrant: hasGrantFn,
    scopeOf: (k) => (typeof hasGrantFn === 'function' && hasGrantFn(k) ? 'ORGANIZATION' : null),
    isSystemAdmin: false,
  });
}

export function navItemRequiredGrant(item) {
  const fromItem = String(item?.requiredGrant || '').trim();
  if (fromItem) return fromItem;
  return ADMIN_NAV_REQUIRED_GRANT[String(item?.id || '').trim()] || '';
}

const ADMIN_PAGE_SCOPES = new Set(['DEPARTMENT', 'ORGANIZATION', 'SYSTEM', 'GLOBAL']);

/** SELF chỉ xem hồ sơ mình — không mở trang quản trị. */
export function adminScopeOpensPage(scope) {
  return ADMIN_PAGE_SCOPES.has(String(scope || '').trim().toUpperCase());
}

/** Gom mã quyền nav từ map tĩnh + requiredGrant trên catalog (gồm employee.invite). */
export function collectAdminNavGrantKeysFromDomains(domains) {
  const keys = new Set(Object.values(ADMIN_NAV_REQUIRED_GRANT).filter(Boolean));
  for (const domain of domains || []) {
    for (const section of domain?.sections || []) {
      for (const item of section?.items || []) {
        const key = navItemRequiredGrant(item);
        if (key) keys.add(key);
      }
    }
  }
  return keys;
}

export function hasAnyAdminNavGrant(hasGrant, scopeOf, domains) {
  if (typeof hasGrant !== 'function' || typeof scopeOf !== 'function') return false;
  const keys =
    domains != null
      ? collectAdminNavGrantKeysFromDomains(domains)
      : new Set([
          ...Object.values(ADMIN_NAV_REQUIRED_GRANT),
          RBAC_GRANT.EMPLOYEE_INVITE,
          RBAC_GRANT.EMPLOYEE_VIEW,
          RBAC_GRANT.AUDIT_VIEW,
          RBAC_GRANT.POLICY_VIEW,
          RBAC_GRANT.MEETING_VIEW,
          RBAC_GRANT.CHAT_VIEW,
          RBAC_GRANT.FILE_DOWNLOAD,
          RBAC_GRANT.NOTIF_VIEW,
        ]);
  for (const key of keys) {
    if (!key || !hasGrant(key)) continue;
    if (adminScopeOpensPage(scopeOf(key))) return true;
  }
  return false;
}

/**
 * Khớp STORED_ADMIN_MAINTAIN_KEYS (organization-service) + master_data
 * (cùng cửa path `/rbac/project-roles` / authorizeOrGrant admin trên catalog dự án).
 * Không gồm policy, audit, mời người.
 */
const OPERATOR_MAINTAIN_GRANTS = new Set([
  'organization.organization_role.view',
  'organization.organization_role.update',
  'organization.position.view',
  'organization.position.create',
  'organization.position.update',
  'organization.structure.view',
  'organization.employee.view',
  'organization.master_data.view',
  'organization.master_data.update',
]);

function operatorSurfacePath(item) {
  const path = String(item?.path || '').split('?')[0].replace(/\/+$/, '');
  if (!path) return false;
  if (path === '/app/admin/backup' || path.startsWith('/app/admin/backup/')) return true;
  if (path === '/app/admin/rbac/project-roles' || path.startsWith('/app/admin/rbac/project-roles/')) {
    return true;
  }
  return false;
}

function scopedGrantOpens(key, hasGrant, scopeOf) {
  if (!key || typeof hasGrant !== 'function' || typeof scopeOf !== 'function') return false;
  if (!hasGrant(key)) return false;
  return adminScopeOpensPage(scopeOf(key));
}

/**
 * Mục sidebar/route admin được phép mở.
 * systemRole=admin = toàn bộ catalog (khớp hub + chức năng phân hệ).
 * Quản trị khác: theo grantScopes (scope mở trang) — siết chặt, không mở vì chỉ là owner/HR.
 */
export function navItemIsAllowed(item, { hasGrant, scopeOf, isSystemAdmin = false } = {}) {
  if (!item) return false;
  if (isSystemAdmin) return true;
  const key = navItemRequiredGrant(item);
  if (scopedGrantOpens(key, hasGrant, scopeOf)) return true;
  // Hub cấu hình ghi policy.view. Director chỉ có policy.update — mã sửa mở cùng cửa.
  if (key === RBAC_GRANT.POLICY_VIEW && scopedGrantOpens(RBAC_GRANT.POLICY_UPDATE, hasGrant, scopeOf)) {
    return true;
  }
  return false;
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

/** Domain còn ≥1 leaf hiện sidebar (không `nav:hidden`) sau khi lọc grant. */
export function domainHasSidebarVisibleItem(domain) {
  for (const section of domain?.sections || []) {
    for (const item of section?.items || []) {
      if (item?.nav === 'hidden') continue;
      return true;
    }
  }
  return false;
}

/**
 * Catalog domain → chỉ domain actor mở được (≥1 leaf sidebar sau `navItemIsAllowed`).
 * Dùng chung picker «Loại quản lý» + Admin Hub.
 */
export function listAdminDomainsForActor(domains, ctx) {
  return (Array.isArray(domains) ? domains : [])
    .filter((d) => d && d.nav !== 'hidden')
    .map((d) => filterAdminDomainByGrant(d, ctx))
    .filter(domainHasSidebarVisibleItem);
}

/**
 * Path leaf sidebar-visible đầu tiên được phép trong domain (landing picker/hub).
 * Không dùng domain.path mù — tránh HR vào /rbac taxonomy rồi bị redirect.
 */
export function firstAllowedAdminLeafPath(domain, ctx) {
  if (!domain) return '';
  const filtered = filterAdminDomainByGrant(domain, ctx);
  for (const section of filtered?.sections || []) {
    for (const item of section?.items || []) {
      if (item?.nav === 'hidden') continue;
      const path = String(item?.path || '').split('?')[0].replace(/\/+$/, '');
      if (path) return path;
    }
  }
  return '';
}

/** Leaf ids sidebar-visible còn lại sau filter grant (test / debug). */
export function listAllowedAdminLeafIds(domain, ctx) {
  if (!domain) return [];
  const filtered = filterAdminDomainByGrant(domain, ctx);
  const ids = [];
  for (const section of filtered?.sections || []) {
    for (const item of section?.items || []) {
      if (item?.nav === 'hidden') continue;
      if (item?.id) ids.push(String(item.id));
    }
  }
  return ids;
}
