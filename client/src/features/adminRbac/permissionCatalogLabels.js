/**
 * Nhãn catalog quyền hệ thống (FE). Mã SoT vẫn từ GET /permissions/system.
 * Path i18n lồng theo dấu chấm của key: adminDomains.rbac.permCat|permMod|perm.*
 */

function safeT(t, path) {
  if (typeof t !== 'function') return undefined;
  const value = t(path);
  if (value == null || value === path) return undefined;
  return String(value);
}

export function labelCategory(categoryKey, t) {
  const key = String(categoryKey || '').trim();
  if (!key) return '—';
  return safeT(t, `adminDomains.rbac.permCat.${key}`) || key;
}

/** @param {string} moduleKey — vd. system.permission_group */
export function labelModule(moduleKey, t) {
  const key = String(moduleKey || '').trim();
  if (!key) return '—';
  return safeT(t, `adminDomains.rbac.permMod.${key}`) || key;
}

/** @param {string} permissionKey — vd. system.permission_group.view */
export function labelPermission(permissionKey, t) {
  const key = String(permissionKey || '').trim();
  if (!key) return '—';
  const labeled = safeT(t, `adminDomains.rbac.perm.${key}`);
  if (labeled) return labeled;
  const parts = key.split('.');
  const action = parts.length >= 3 ? parts[parts.length - 1] : key;
  return action || key;
}

/** Keys dùng để assert coverage (trừ branch/division — ẩn trên UI org-role). */
export const CATALOG_PERMISSION_KEYS_FOR_LABELS = Object.freeze([
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
  'organization.structure.view',
  'organization.structure.update',
  'organization.master_data.view',
  'organization.master_data.update',
  'organization.policy.view',
  'organization.policy.update',
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
  'project.change_request.view',
  'project.change_request.create',
  'project.change_request.update',
  'project.change_request.delete',
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

export const CATALOG_CATEGORY_KEYS = Object.freeze([
  'system',
  'organization',
  'project',
  'communication',
  'meeting',
  'file',
  'notification',
]);

export const CATALOG_MODULE_KEYS = Object.freeze([
  'system.permission_group',
  'system.audit',
  'organization.employee',
  'organization.department',
  'organization.position',
  'organization.organization_role',
  'organization.team',
  'organization.structure',
  'organization.master_data',
  'organization.policy',
  'project.project',
  'project.sprint',
  'project.backlog',
  'project.task',
  'project.workflow',
  'project.report',
  'project.change_request',
  'communication.chat',
  'communication.channel',
  'communication.announcement',
  'meeting.meeting',
  'file.file',
  'notification.notification',
]);
