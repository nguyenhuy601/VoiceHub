/**
 * Permission Groups — catalog cố định (System Role UI / docs map).
 * Không đổi auth-service contract Phase 2.0.
 */

const MASTER_PERMISSION_GROUPS = Object.freeze([
  {
    key: 'system_administrator',
    label: 'System Administrator',
    description: 'Full platform operations (tenant/system scope).',
    linkedProjectRoleKey: 'project_manager',
  },
  {
    key: 'organization_administrator',
    label: 'Organization Administrator',
    description: 'Org owner/admin membership + org capabilities.',
    linkedProjectRoleKey: 'project_manager',
  },
  {
    key: 'project_manager',
    label: 'Project Manager',
    description: 'Delivery lead — project_manager role template.',
    linkedProjectRoleKey: 'project_manager',
  },
  {
    key: 'developer',
    label: 'Developer',
    description: 'Individual contributor — backend_developer template.',
    linkedProjectRoleKey: 'backend_developer',
  },
  {
    key: 'viewer',
    label: 'Viewer',
    description: 'Read-only — observer template.',
    linkedProjectRoleKey: 'observer',
  },
]);

const MASTER_PERMISSION_GROUP_KEYS = Object.freeze(
  MASTER_PERMISSION_GROUPS.map((g) => g.key)
);

function getPermissionGroupByKey(key) {
  const k = String(key || '').trim().toLowerCase();
  return MASTER_PERMISSION_GROUPS.find((g) => g.key === k) || null;
}

module.exports = {
  MASTER_PERMISSION_GROUPS,
  MASTER_PERMISSION_GROUP_KEYS,
  getPermissionGroupByKey,
};
