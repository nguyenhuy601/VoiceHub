/**
 * Catalog quyền + scope cho admin RBAC (tạo/sửa gói Permission).
 * Lưu BE dạng { resource, actions: string[] }.
 * Follow-up: gắn từng API (vd. GET /projects/resources/planner) vào slot matrix — chưa map Project Role PM.
 */

export const ROLE_SCOPES = [
  { id: 'GLOBAL', labelKey: 'adminRbac.scopeGlobal', fallback: 'GLOBAL — Toàn hệ thống' },
  { id: 'ORGANIZATION', labelKey: 'adminRbac.scopeOrganization', fallback: 'ORGANIZATION — Toàn công ty' },
  { id: 'DEPARTMENT', labelKey: 'adminRbac.scopeDepartment', fallback: 'DEPARTMENT — Trong phòng ban' },
  { id: 'TEAM', labelKey: 'adminRbac.scopeTeam', fallback: 'TEAM — Trong nhóm' },
  { id: 'PERSONAL', labelKey: 'adminRbac.scopePersonal', fallback: 'PERSONAL — Chỉ bản thân' },
];

export const DEFAULT_ROLE_SCOPE = 'ORGANIZATION';

/** Gói Permission trên `/rbac/roles` — chỉ ORGANIZATION (không GLOBAL / DEPARTMENT / TEAM / PERSONAL). */
export const PACK_ROLE_SCOPES = ROLE_SCOPES.filter((item) => item.id === 'ORGANIZATION');

/** Template Project Role / delivery — giữ `project.*`. Gói org strip các key này. */
export const PROJECT_PACK_TEMPLATE_KEYS = new Set([
  'project_admin',
  'project_manager',
  'product_owner',
  'scrum_master',
  'developer',
  'qa',
]);

export function isProjectMasterPermission(key) {
  return String(key || '')
    .trim()
    .startsWith('project.');
}

export function isProjectPackTemplateKey(templateKey) {
  return PROJECT_PACK_TEMPLATE_KEYS.has(String(templateKey || '').trim());
}

/** @typedef {{ resource: string, action: string, label: string, description: string }} RbacPermDef */

/**
 * Nhóm A–H theo spec admin.
 * Mỗi permission: resource + action (fine-grained).
 */
export const ADMIN_RBAC_PERMISSION_GROUPS = [
  {
    id: 'user-management',
    label: 'User Management',
    labelVi: 'Quản lý người dùng',
    adminOnly: false,
    sections: [
      {
        id: 'user',
        label: 'User',
        labelVi: 'Người dùng',
        permissions: [
          { resource: 'user', action: 'view', label: 'View User', description: 'Xem danh sách người dùng' },
          { resource: 'user', action: 'create', label: 'Create User', description: 'Tạo tài khoản' },
          { resource: 'user', action: 'update', label: 'Update User', description: 'Sửa thông tin người dùng' },
          { resource: 'user', action: 'delete', label: 'Delete User', description: 'Xóa người dùng' },
          { resource: 'user', action: 'disable', label: 'Disable User', description: 'Khóa tài khoản' },
          { resource: 'user', action: 'reset_password', label: 'Reset Password', description: 'Reset mật khẩu' },
          { resource: 'user', action: 'assign_department', label: 'Assign Department', description: 'Gán phòng ban' },
          { resource: 'user', action: 'assign_team', label: 'Assign Team', description: 'Gán nhóm' },
        ],
      },
    ],
  },
  {
    id: 'org-structure',
    label: 'Organization Structure',
    labelVi: 'Cơ cấu tổ chức',
    adminOnly: false,
    sections: [
      {
        id: 'department',
        label: 'Department',
        labelVi: 'Phòng ban',
        permissions: [
          { resource: 'department', action: 'view', label: 'View Department', description: 'Xem phòng ban' },
          { resource: 'department', action: 'create', label: 'Create Department', description: 'Tạo phòng ban' },
          { resource: 'department', action: 'update', label: 'Update Department', description: 'Sửa phòng ban' },
          { resource: 'department', action: 'delete', label: 'Delete Department', description: 'Xóa phòng ban' },
          { resource: 'department', action: 'assign_manager', label: 'Assign Manager', description: 'Gán trưởng phòng' },
        ],
      },
      {
        id: 'team',
        label: 'Team',
        labelVi: 'Nhóm',
        permissions: [
          { resource: 'team', action: 'view', label: 'View Team', description: 'Xem nhóm' },
          { resource: 'team', action: 'create', label: 'Create Team', description: 'Tạo nhóm' },
          { resource: 'team', action: 'update', label: 'Update Team', description: 'Sửa nhóm' },
          { resource: 'team', action: 'delete', label: 'Delete Team', description: 'Xóa nhóm' },
          { resource: 'team', action: 'add_member', label: 'Add Member', description: 'Thêm thành viên' },
          { resource: 'team', action: 'remove_member', label: 'Remove Member', description: 'Xóa thành viên' },
          { resource: 'team', action: 'assign_leader', label: 'Assign Leader', description: 'Gán trưởng nhóm' },
        ],
      },
    ],
  },
  {
    id: 'chat',
    label: 'Chat Management',
    labelVi: 'Quản lý Chat',
    adminOnly: false,
    sections: [
      {
        id: 'channel',
        label: 'Channel',
        labelVi: 'Kênh',
        permissions: [
          { resource: 'channel', action: 'view', label: 'View Channel', description: 'Xem Channel' },
          { resource: 'channel', action: 'create', label: 'Create Channel', description: 'Tạo Channel' },
          { resource: 'channel', action: 'update', label: 'Update Channel', description: 'Sửa Channel' },
          { resource: 'channel', action: 'delete', label: 'Delete Channel', description: 'Xóa Channel' },
          { resource: 'channel', action: 'manage_member', label: 'Manage Member', description: 'Quản lý thành viên' },
          { resource: 'channel', action: 'delete_message', label: 'Delete Message', description: 'Xóa tin nhắn' },
          { resource: 'channel', action: 'pin_message', label: 'Pin Message', description: 'Ghim tin nhắn' },
          { resource: 'channel', action: 'export', label: 'Export Chat', description: 'Xuất lịch sử chat' },
        ],
      },
    ],
  },
  {
    id: 'voice-meeting',
    label: 'Voice & Meeting',
    labelVi: 'Voice & Meeting',
    adminOnly: false,
    sections: [
      {
        id: 'voice',
        label: 'Voice',
        labelVi: 'Voice',
        permissions: [
          { resource: 'voice', action: 'create_room', label: 'Create Voice Room', description: 'Tạo phòng Voice' },
          { resource: 'voice', action: 'manage_room', label: 'Manage Voice Room', description: 'Quản lý phòng Voice' },
          { resource: 'voice', action: 'kick', label: 'Kick User', description: 'Xóa người khỏi phòng' },
          { resource: 'voice', action: 'mute', label: 'Mute User', description: 'Tắt mic' },
        ],
      },
      {
        id: 'meeting',
        label: 'Meeting',
        labelVi: 'Meeting',
        permissions: [
          { resource: 'meeting', action: 'create', label: 'Create Meeting', description: 'Tạo cuộc họp' },
          { resource: 'meeting', action: 'end', label: 'End Meeting', description: 'Kết thúc họp' },
          { resource: 'meeting', action: 'view_recording', label: 'View Recording', description: 'Xem bản ghi' },
          { resource: 'meeting', action: 'download_recording', label: 'Download Recording', description: 'Tải bản ghi' },
          { resource: 'meeting', action: 'view_transcript', label: 'View Transcript', description: 'Xem transcript' },
          { resource: 'meeting', action: 'view_ai_summary', label: 'View AI Summary', description: 'Xem AI Summary' },
        ],
      },
    ],
  },
  {
    id: 'task-management',
    label: 'Task Management',
    labelVi: 'Quản lý Task',
    adminOnly: false,
    sections: [
      {
        id: 'project',
        label: 'Project',
        labelVi: 'Dự án',
        permissions: [
          { resource: 'project', action: 'view', label: 'View Project', description: 'Xem dự án' },
          { resource: 'project', action: 'create', label: 'Create Project', description: 'Tạo dự án' },
          { resource: 'project', action: 'update', label: 'Update Project', description: 'Sửa dự án' },
          { resource: 'project', action: 'delete', label: 'Delete Project', description: 'Xóa dự án' },
          { resource: 'project', action: 'manage_member', label: 'Manage Member', description: 'Quản lý thành viên' },
        ],
      },
      {
        id: 'task',
        label: 'Task',
        labelVi: 'Task',
        permissions: [
          { resource: 'task', action: 'view', label: 'View Task', description: 'Xem Task' },
          { resource: 'task', action: 'create', label: 'Create Task', description: 'Tạo Task' },
          { resource: 'task', action: 'update', label: 'Update Task', description: 'Sửa Task' },
          { resource: 'task', action: 'delete', label: 'Delete Task', description: 'Xóa Task' },
          { resource: 'task', action: 'assign', label: 'Assign Task', description: 'Giao Task' },
          { resource: 'task', action: 'change_status', label: 'Change Status', description: 'Đổi trạng thái' },
          { resource: 'task', action: 'comment', label: 'Comment Task', description: 'Bình luận' },
          { resource: 'task', action: 'attach_file', label: 'Attach File', description: 'Đính kèm file' },
        ],
      },
      {
        id: 'change_request',
        label: 'Change Request',
        labelVi: 'Yêu cầu thay đổi',
        permissions: [
          { resource: 'change_request', action: 'view', label: 'View Change Request', description: 'Xem Change Request' },
          { resource: 'change_request', action: 'create', label: 'Create Change Request', description: 'Tạo Change Request' },
          { resource: 'change_request', action: 'update', label: 'Update Change Request', description: 'Sửa Change Request' },
          { resource: 'change_request', action: 'delete', label: 'Delete Change Request', description: 'Xóa Change Request' },
        ],
      },
    ],
  },
  {
    id: 'file',
    label: 'File Management',
    labelVi: 'Quản lý File',
    adminOnly: false,
    sections: [
      {
        id: 'file',
        label: 'File',
        labelVi: 'File',
        permissions: [
          { resource: 'file', action: 'upload', label: 'Upload File', description: 'Upload file' },
          { resource: 'file', action: 'download', label: 'Download File', description: 'Download file' },
          { resource: 'file', action: 'delete', label: 'Delete File', description: 'Xóa file' },
          { resource: 'file', action: 'restore', label: 'Restore File', description: 'Khôi phục file' },
          { resource: 'file', action: 'manage_storage', label: 'Manage Storage', description: 'Quản lý dung lượng' },
        ],
      },
    ],
  },
  {
    id: 'report',
    label: 'Report & Analytics',
    labelVi: 'Báo cáo & Phân tích',
    adminOnly: false,
    sections: [
      {
        id: 'report',
        label: 'Report',
        labelVi: 'Báo cáo',
        permissions: [
          { resource: 'report', action: 'view', label: 'View Report', description: 'Xem báo cáo' },
          { resource: 'report', action: 'export', label: 'Export Report', description: 'Xuất báo cáo' },
          { resource: 'report', action: 'view_user_activity', label: 'View User Activity', description: 'Xem hoạt động user' },
          { resource: 'report', action: 'view_task_report', label: 'View Task Report', description: 'Xem báo cáo task' },
          { resource: 'report', action: 'view_meeting_report', label: 'View Meeting Report', description: 'Xem báo cáo meeting' },
        ],
      },
    ],
  },
  {
    id: 'system',
    label: 'System Administration',
    labelVi: 'Quản trị hệ thống',
    adminOnly: true,
    sections: [
      {
        id: 'system',
        label: 'System',
        labelVi: 'Hệ thống',
        permissions: [
          { resource: 'system', action: 'manage_role', label: 'Manage Role', description: 'Quản lý Role' },
          { resource: 'system', action: 'manage_permission', label: 'Manage Permission', description: 'Quản lý Permission' },
          { resource: 'system', action: 'view_audit_log', label: 'View Audit Log', description: 'Xem nhật ký' },
          { resource: 'system', action: 'manage_backup', label: 'Manage Backup', description: 'Backup/Restore' },
          { resource: 'system', action: 'configuration', label: 'System Configuration', description: 'Cấu hình hệ thống' },
          { resource: 'system', action: 'manage_ai', label: 'Manage AI', description: 'Quản lý AI' },
          { resource: 'system', action: 'manage_security', label: 'Manage Security', description: 'Quản lý bảo mật' },
        ],
      },
    ],
  },
];

/** Flat map key `resource:action` → permission def */
export function buildPermissionLabelMap(groups = ADMIN_RBAC_PERMISSION_GROUPS) {
  const map = new Map();
  for (const group of groups) {
    for (const section of group.sections || []) {
      for (const perm of section.permissions || []) {
        map.set(`${perm.resource}:${perm.action}`, { ...perm, groupId: group.id, sectionId: section.id });
      }
    }
  }
  return map;
}

/** Dạng legacy cho matrix / helpers: { id, label, resources: [{ resource, actions }] } */
export function toLegacyPermissionGroups(groups = ADMIN_RBAC_PERMISSION_GROUPS, locale = 'vi') {
  return groups.map((group) => {
    const resources = [];
    for (const section of group.sections || []) {
      const byResource = new Map();
      for (const perm of section.permissions || []) {
        if (!byResource.has(perm.resource)) byResource.set(perm.resource, []);
        byResource.get(perm.resource).push(perm.action);
      }
      for (const [resource, actions] of byResource) {
        resources.push({ resource, actions, sectionLabel: locale === 'en' ? section.label : section.labelVi });
      }
    }
    return {
      id: group.id,
      label: locale === 'en' ? group.label : group.labelVi,
      adminOnly: Boolean(group.adminOnly),
      resources,
    };
  });
}

export function flattenPermissionSlots(groups = ADMIN_RBAC_PERMISSION_GROUPS) {
  const list = [];
  for (const group of groups) {
    for (const section of group.sections || []) {
      for (const perm of section.permissions || []) {
        list.push({
          key: `${perm.resource}:${perm.action}`,
          groupId: group.id,
          groupLabel: group.label,
          groupLabelVi: group.labelVi,
          sectionLabel: section.label,
          sectionLabelVi: section.labelVi,
          ...perm,
        });
      }
    }
  }
  return list;
}
