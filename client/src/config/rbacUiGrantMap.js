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
  CHANNEL_CREATE: 'communication.channel.create',
  CHANNEL_UPDATE: 'communication.channel.update',
  CHANNEL_DELETE: 'communication.channel.delete',
};

/** nav item id → master key (fallback nếu config chưa gắn requiredGrant). */
export const ADMIN_NAV_REQUIRED_GRANT = {
  'team-create': RBAC_GRANT.TEAM_CREATE,
  'team-edit': RBAC_GRANT.TEAM_UPDATE,
  'team-archive': RBAC_GRANT.TEAM_DELETE,
  'team-dept': RBAC_GRANT.TEAM_UPDATE,
  'dept-create': RBAC_GRANT.DEPT_CREATE,
  'dept-edit': RBAC_GRANT.DEPT_UPDATE,
  'dept-disable': RBAC_GRANT.DEPT_DELETE,
  'dept-parent': RBAC_GRANT.DEPT_UPDATE,
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
  if (!key) return true;
  return typeof hasGrantFn === 'function' ? Boolean(hasGrantFn(key)) : false;
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
