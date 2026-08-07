const CATEGORIES = Object.freeze([
  { key: 'system', label: 'SYSTEM' },
  { key: 'organization', label: 'ORGANIZATION' },
  { key: 'project', label: 'PROJECT' },
  { key: 'communication', label: 'COMMUNICATION' },
  { key: 'meeting', label: 'MEETING' },
  { key: 'file', label: 'FILE' },
  { key: 'notification', label: 'NOTIFICATION' },
]);

const MODULES = Object.freeze([
  { key: 'system.permission_group', categoryKey: 'system', label: 'Permission Group' },
  { key: 'system.audit', categoryKey: 'system', label: 'Audit' },
  { key: 'organization.employee', categoryKey: 'organization', label: 'Employee' },
  { key: 'organization.department', categoryKey: 'organization', label: 'Department' },
  { key: 'organization.position', categoryKey: 'organization', label: 'Position' },
  { key: 'organization.organization_role', categoryKey: 'organization', label: 'Organization Role' },
  { key: 'organization.team', categoryKey: 'organization', label: 'Team' },
  { key: 'project.project', categoryKey: 'project', label: 'Project' },
  { key: 'project.sprint', categoryKey: 'project', label: 'Sprint' },
  { key: 'project.backlog', categoryKey: 'project', label: 'Backlog' },
  { key: 'project.task', categoryKey: 'project', label: 'Task' },
  { key: 'project.workflow', categoryKey: 'project', label: 'Workflow' },
  { key: 'project.report', categoryKey: 'project', label: 'Report' },
  { key: 'communication.chat', categoryKey: 'communication', label: 'Chat' },
  { key: 'communication.channel', categoryKey: 'communication', label: 'Channel' },
  { key: 'communication.announcement', categoryKey: 'communication', label: 'Announcement' },
  { key: 'meeting.meeting', categoryKey: 'meeting', label: 'Meeting' },
  { key: 'file.file', categoryKey: 'file', label: 'File' },
  { key: 'notification.notification', categoryKey: 'notification', label: 'Notification' },
]);

const MASTER_PERMISSIONS = Object.freeze([
  'system.permission_group.view',
  'system.permission_group.clone',
  'system.permission_group.rename',
  'system.permission_group.update_grant',
  'system.permission_group.assign',
  'system.audit.view',

  'organization.employee.view',
  'organization.employee.invite',
  'organization.employee.update',
  'organization.employee.disable',
  'organization.employee.delete',
  'organization.employee.reset_password',
  'organization.department.view',
  'organization.department.create',
  'organization.department.update',
  'organization.department.delete',
  'organization.position.view',
  'organization.position.create',
  'organization.position.update',
  'organization.position.delete',
  'organization.organization_role.view',
  'organization.organization_role.update',
  'organization.team.view',
  'organization.team.create',
  'organization.team.update',
  'organization.team.delete',

  'project.project.view',
  'project.project.create',
  'project.project.update',
  'project.project.archive',
  'project.project.delete',
  'project.sprint.view',
  'project.sprint.create',
  'project.sprint.start',
  'project.sprint.close',
  'project.sprint.delete',
  'project.backlog.view',
  'project.backlog.update',
  'project.task.view',
  'project.task.create',
  'project.task.update',
  'project.task.delete',
  'project.task.assign',
  'project.task.comment',
  'project.task.log_work',
  'project.workflow.view',
  'project.workflow.update',
  'project.report.view',

  'communication.chat.view',
  'communication.chat.send',
  'communication.chat.delete',
  'communication.channel.view',
  'communication.channel.create',
  'communication.channel.update',
  'communication.channel.delete',
  'communication.announcement.view',
  'communication.announcement.publish',

  'meeting.meeting.view',
  'meeting.meeting.create',
  'meeting.meeting.end',
  'meeting.meeting.view_recording',

  'file.file.upload',
  'file.file.download',
  'file.file.delete',

  'notification.notification.view',
  'notification.notification.send',
]);

const TEMPLATE_DEFINITIONS = Object.freeze([
  {
    key: 'organization_admin',
    label: 'Organization Admin',
    grants: MASTER_PERMISSIONS.filter((k) => !k.startsWith('meeting.') || k.endsWith('.view')),
  },
  {
    key: 'project_admin',
    label: 'Project Admin',
    grants: MASTER_PERMISSIONS.filter((k) => k.startsWith('project.') || k.startsWith('communication.') || k.startsWith('file.')),
  },
  {
    key: 'department_manager',
    label: 'Department Manager',
    grants: [
      'organization.employee.view',
      'organization.employee.update',
      'organization.department.view',
      'organization.team.view',
      'project.project.view',
      'project.task.view',
      'project.task.assign',
      'project.report.view',
      // Org channel messages (gateway chat:read) — HR/dept manager cần đọc chat dự án/org
      'communication.chat.view',
      'communication.chat.send',
      'communication.channel.view',
    ],
  },
  {
    key: 'project_manager',
    label: 'Project Manager',
    grants: [
      'project.project.view',
      'project.project.update',
      'project.sprint.view',
      'project.sprint.create',
      'project.sprint.start',
      'project.sprint.close',
      'project.task.view',
      'project.task.create',
      'project.task.update',
      'project.task.assign',
      'project.task.comment',
      'project.report.view',
      'communication.chat.view',
      'communication.chat.send',
      'file.file.upload',
      'file.file.download',
    ],
  },
  {
    key: 'product_owner',
    label: 'Product Owner',
    grants: [
      'project.project.view',
      'project.backlog.view',
      'project.backlog.update',
      'project.sprint.view',
      'project.task.view',
      'project.task.create',
      'project.task.update',
      'project.task.comment',
      'project.report.view',
    ],
  },
  {
    key: 'scrum_master',
    label: 'Scrum Master',
    grants: [
      'project.project.view',
      'project.sprint.view',
      'project.sprint.create',
      'project.sprint.start',
      'project.sprint.close',
      'project.task.view',
      'project.task.update',
      'project.task.assign',
      'project.task.comment',
      'project.report.view',
    ],
  },
  {
    key: 'developer',
    label: 'Developer',
    grants: [
      'project.task.view',
      'project.task.create',
      'project.task.update',
      'project.task.assign',
      'project.task.comment',
      'project.task.log_work',
      'project.sprint.view',
      'communication.chat.view',
      'communication.chat.send',
      'file.file.upload',
      'file.file.download',
    ],
  },
  {
    key: 'qa',
    label: 'QA',
    grants: [
      'project.task.view',
      'project.task.update',
      'project.task.comment',
      'project.sprint.view',
      'project.report.view',
      'communication.chat.view',
      'communication.chat.send',
      'file.file.upload',
      'file.file.download',
    ],
  },
  {
    key: 'viewer',
    label: 'Viewer',
    grants: MASTER_PERMISSIONS.filter((k) => k.endsWith('.view') || k.endsWith('.download') || k.endsWith('.view_recording')),
  },
]);

const SYSTEM_TEMPLATE_KEYS = new Set(TEMPLATE_DEFINITIONS.map((x) => x.key));
const MASTER_PERMISSION_SET = new Set(MASTER_PERMISSIONS);

/** Specialization presets for naming: `<Specialization> <Template>` */
const SPECIALIZATIONS = Object.freeze([
  { key: '', label: '(Mặc định template)' },
  { key: 'Backend', label: 'Backend' },
  { key: 'Frontend', label: 'Frontend' },
  { key: 'Mobile', label: 'Mobile' },
  { key: 'Automation', label: 'Automation' },
  { key: 'Manual', label: 'Manual' },
  { key: 'Performance', label: 'Performance' },
  { key: 'Other', label: 'Other' },
]);

/**
 * Gateway/legacy action (`resource:action`) → master permission keys (V2).
 * Union: nếu user có bất kỳ master key nào trong list → allow legacy action.
 */
const LEGACY_ACTION_TO_MASTER = Object.freeze({
  'user:read': ['organization.employee.view'],
  'user:write': [
    'organization.employee.view',
    'organization.employee.invite',
    'organization.employee.update',
    'organization.employee.reset_password',
  ],
  'user:delete': ['organization.employee.delete', 'organization.employee.disable'],

  'organization:read': [
    'organization.department.view',
    'organization.team.view',
    'organization.position.view',
    'organization.organization_role.view',
  ],
  'organization:write': [
    'organization.department.create',
    'organization.department.update',
    'organization.team.create',
    'organization.team.update',
    'organization.position.create',
    'organization.position.update',
    'organization.organization_role.update',
  ],
  'organization:delete': [
    'organization.department.delete',
    'organization.team.delete',
    'organization.position.delete',
  ],

  'role:read': ['system.permission_group.view', 'organization.organization_role.view'],
  'role:write': [
    'system.permission_group.clone',
    'system.permission_group.rename',
    'system.permission_group.update_grant',
    'system.permission_group.assign',
  ],

  'task:read': ['project.task.view', 'project.project.view', 'project.sprint.view', 'project.backlog.view'],
  'task:write': [
    'project.task.create',
    'project.task.update',
    'project.task.assign',
    'project.task.comment',
    'project.task.log_work',
    'project.project.create',
    'project.project.update',
    'project.sprint.create',
    'project.sprint.start',
    'project.sprint.close',
    'project.backlog.update',
    'project.workflow.update',
  ],
  'task:delete': ['project.task.delete', 'project.project.delete', 'project.sprint.delete', 'project.project.archive'],

  'chat:read': ['communication.chat.view', 'communication.channel.view', 'communication.announcement.view'],
  'chat:write': [
    'communication.chat.send',
    'communication.channel.create',
    'communication.channel.update',
    'communication.announcement.publish',
  ],
  'chat:delete': ['communication.chat.delete', 'communication.channel.delete'],

  'voice:read': ['meeting.meeting.view', 'meeting.meeting.view_recording'],
  'voice:write': ['meeting.meeting.create', 'meeting.meeting.end'],

  'document:read': ['file.file.download'],
  'document:write': ['file.file.upload', 'file.file.download'],
  'document:delete': ['file.file.delete'],

  'friend:read': ['organization.employee.view'],
  'friend:write': ['organization.employee.view'],
});

/**
 * Master key → legacy Role.permissions entries (materialize for gateway).
 */
const MASTER_TO_LEGACY_ENTRIES = Object.freeze({
  'organization.employee.view': { resource: 'user', actions: ['read', 'view'] },
  'organization.employee.invite': { resource: 'user', actions: ['write', 'create'] },
  'organization.employee.update': { resource: 'user', actions: ['write', 'update'] },
  'organization.employee.disable': { resource: 'user', actions: ['write', 'disable'] },
  'organization.employee.delete': { resource: 'user', actions: ['delete'] },
  'organization.employee.reset_password': { resource: 'user', actions: ['write', 'reset_password'] },
  'organization.department.view': { resource: 'organization', actions: ['read'] },
  'organization.department.create': { resource: 'organization', actions: ['write'] },
  'organization.department.update': { resource: 'organization', actions: ['write'] },
  'organization.department.delete': { resource: 'organization', actions: ['delete'] },
  'organization.team.view': { resource: 'organization', actions: ['read'] },
  'organization.team.create': { resource: 'organization', actions: ['write'] },
  'organization.team.update': { resource: 'organization', actions: ['write'] },
  'organization.team.delete': { resource: 'organization', actions: ['delete'] },
  'organization.position.view': { resource: 'organization', actions: ['read'] },
  'organization.position.create': { resource: 'organization', actions: ['write'] },
  'organization.position.update': { resource: 'organization', actions: ['write'] },
  'organization.position.delete': { resource: 'organization', actions: ['delete'] },
  'organization.organization_role.view': { resource: 'role', actions: ['read'] },
  'organization.organization_role.update': { resource: 'role', actions: ['write'] },
  'system.permission_group.view': { resource: 'role', actions: ['read'] },
  'system.permission_group.clone': { resource: 'role', actions: ['write'] },
  'system.permission_group.rename': { resource: 'role', actions: ['write'] },
  'system.permission_group.update_grant': { resource: 'role', actions: ['write'] },
  'system.permission_group.assign': { resource: 'role', actions: ['write'] },
  'system.audit.view': { resource: 'system', actions: ['view_audit_log'] },
  'project.project.view': { resource: 'task', actions: ['read'] },
  'project.project.create': { resource: 'task', actions: ['write'] },
  'project.project.update': { resource: 'task', actions: ['write'] },
  'project.project.archive': { resource: 'task', actions: ['write'] },
  'project.project.delete': { resource: 'task', actions: ['delete'] },
  'project.sprint.view': { resource: 'task', actions: ['read'] },
  'project.sprint.create': { resource: 'task', actions: ['write'] },
  'project.sprint.start': { resource: 'task', actions: ['write'] },
  'project.sprint.close': { resource: 'task', actions: ['write'] },
  'project.sprint.delete': { resource: 'task', actions: ['delete'] },
  'project.backlog.view': { resource: 'task', actions: ['read'] },
  'project.backlog.update': { resource: 'task', actions: ['write'] },
  'project.task.view': { resource: 'task', actions: ['read'] },
  'project.task.create': { resource: 'task', actions: ['write'] },
  'project.task.update': { resource: 'task', actions: ['write'] },
  'project.task.delete': { resource: 'task', actions: ['delete'] },
  'project.task.assign': { resource: 'task', actions: ['write'] },
  'project.task.comment': { resource: 'task', actions: ['write'] },
  'project.task.log_work': { resource: 'task', actions: ['write'] },
  'project.workflow.view': { resource: 'task', actions: ['read'] },
  'project.workflow.update': { resource: 'task', actions: ['write'] },
  'project.report.view': { resource: 'task', actions: ['read'] },
  'communication.chat.view': { resource: 'chat', actions: ['read'] },
  'communication.chat.send': { resource: 'chat', actions: ['write'] },
  'communication.chat.delete': { resource: 'chat', actions: ['delete'] },
  'communication.channel.view': { resource: 'chat', actions: ['read'] },
  'communication.channel.create': { resource: 'chat', actions: ['write'] },
  'communication.channel.update': { resource: 'chat', actions: ['write'] },
  'communication.channel.delete': { resource: 'chat', actions: ['delete'] },
  'communication.announcement.view': { resource: 'chat', actions: ['read'] },
  'communication.announcement.publish': { resource: 'chat', actions: ['write'] },
  'meeting.meeting.view': { resource: 'voice', actions: ['read'] },
  'meeting.meeting.create': { resource: 'voice', actions: ['write'] },
  'meeting.meeting.end': { resource: 'voice', actions: ['write'] },
  'meeting.meeting.view_recording': { resource: 'voice', actions: ['read'] },
  'file.file.upload': { resource: 'document', actions: ['write'] },
  'file.file.download': { resource: 'document', actions: ['read'] },
  'file.file.delete': { resource: 'document', actions: ['delete'] },
  'notification.notification.view': { resource: 'notification', actions: ['read'] },
  'notification.notification.send': { resource: 'notification', actions: ['write'] },
});

function isValidMasterPermission(permissionKey) {
  return MASTER_PERMISSION_SET.has(String(permissionKey || '').trim());
}

function getTemplateDefinition(templateKey) {
  return TEMPLATE_DEFINITIONS.find((t) => t.key === String(templateKey || '').trim()) || null;
}

function assertCatalogIntegrity() {
  const moduleKeys = new Set(MODULES.map((m) => m.key));
  const categoryKeys = new Set(CATEGORIES.map((c) => c.key));
  const errors = [];

  for (const mod of MODULES) {
    if (!categoryKeys.has(mod.categoryKey)) {
      errors.push(`module ${mod.key} references missing category ${mod.categoryKey}`);
    }
  }
  for (const perm of MASTER_PERMISSIONS) {
    const parts = String(perm).split('.');
    if (parts.length < 3) {
      errors.push(`invalid master permission shape: ${perm}`);
      continue;
    }
    const moduleKey = `${parts[0]}.${parts[1]}`;
    if (!moduleKeys.has(moduleKey)) {
      errors.push(`master permission ${perm} has unknown module ${moduleKey}`);
    }
  }
  for (const tpl of TEMPLATE_DEFINITIONS) {
    for (const g of tpl.grants || []) {
      if (!MASTER_PERMISSION_SET.has(g)) {
        errors.push(`template ${tpl.key} grants unknown permission ${g}`);
      }
    }
  }
  if (errors.length) {
    const err = new Error(`RBAC V2 catalog integrity failed:\n${errors.join('\n')}`);
    err.errorCode = 'RBAC_CATALOG_INVALID';
    err.details = errors;
    throw err;
  }
  return true;
}

/** Materialize master grants → legacy Role.permissions entries */
function materializeLegacyPermissions(grants = []) {
  const byResource = new Map();
  for (const key of grants || []) {
    const entry = MASTER_TO_LEGACY_ENTRIES[String(key || '').trim()];
    if (!entry) continue;
    if (!byResource.has(entry.resource)) byResource.set(entry.resource, new Set());
    for (const action of entry.actions || []) byResource.get(entry.resource).add(action);
  }
  return Array.from(byResource.entries()).map(([resource, actionsSet]) => ({
    resource,
    actions: Array.from(actionsSet),
  }));
}

function resolveMasterKeysForLegacyAction(action) {
  const a = String(action || '').trim();
  if (!a) return [];
  if (MASTER_PERMISSION_SET.has(a)) return [a];
  if (LEGACY_ACTION_TO_MASTER[a]) return LEGACY_ACTION_TO_MASTER[a];
  // Fine-grained legacy like task:view — map via resource.action if present in master as *.resource.action
  const [resource, actionType] = a.split(':');
  if (!resource || !actionType) return [];
  const candidates = MASTER_PERMISSIONS.filter(
    (k) => k.endsWith(`.${resource}.${actionType}`) || k.includes(`.${resource}.`) && k.endsWith(`.${actionType}`)
  );
  return candidates;
}

function buildCatalogTree() {
  return CATEGORIES.map((cat) => ({
    ...cat,
    modules: MODULES.filter((m) => m.categoryKey === cat.key).map((mod) => ({
      ...mod,
      permissions: MASTER_PERMISSIONS.filter((p) => p.startsWith(`${mod.key}.`)).map((key) => {
        const action = key.slice(mod.key.length + 1);
        return { key, action, label: action };
      }),
    })),
  }));
}

module.exports = {
  CATEGORIES,
  MODULES,
  MASTER_PERMISSIONS,
  TEMPLATE_DEFINITIONS,
  SYSTEM_TEMPLATE_KEYS,
  SPECIALIZATIONS,
  LEGACY_ACTION_TO_MASTER,
  MASTER_TO_LEGACY_ENTRIES,
  isValidMasterPermission,
  getTemplateDefinition,
  assertCatalogIntegrity,
  materializeLegacyPermissions,
  resolveMasterKeysForLegacyAction,
  buildCatalogTree,
};
