/**
 * 16 domain quản trị — khung sidebar + route.
 * `implementation` trỏ tới màn đã có; còn lại hiển thị placeholder.
 */

export const ADMIN_SUITE_COLOR = '#EF4444';

export const ADMIN_DOMAIN_STORAGE_KEY = 'vh_admin_active_domain';

/** @typedef {{ id: string, path: string, labelKey: string, end?: boolean, implementation?: string, badgeKey?: string, settingsTab?: string }} AdminNavItem */
/** @typedef {{ id: string, labelKey?: string, items: AdminNavItem[] }} AdminNavSection */

/**
 * @type {Array<{
 *   id: string,
 *   path: string,
 *   labelKey: string,
 *   icon: string,
 *   adminOnly?: boolean,
 *   navAccordion?: boolean,
 *   sections: AdminNavSection[]
 * }>}
 */
export const ADMIN_DOMAINS = [
  {
    id: 'users',
    path: '/app/admin/users',
    labelKey: 'adminDomains.users.title',
    icon: 'Users',
    sections: [
      {
        id: 'main',
        items: [
          { id: 'list', path: '/app/admin/users', labelKey: 'adminDomains.users.list', end: true, implementation: 'people' },
          { id: 'create', path: '/app/admin/users/create', labelKey: 'adminDomains.users.create', implementation: 'users-create' },
          { id: 'edit', path: '/app/admin/users/edit', labelKey: 'adminDomains.users.edit', implementation: 'users-edit' },
          { id: 'lock', path: '/app/admin/users/lock', labelKey: 'adminDomains.users.lock', implementation: 'users-lock' },
          { id: 'delete', path: '/app/admin/users/delete', labelKey: 'adminDomains.users.delete', implementation: 'users-delete' },
          { id: 'reset-password', path: '/app/admin/users/reset-password', labelKey: 'adminDomains.users.resetPassword', implementation: 'users-reset-password' },
          { id: 'force-password', path: '/app/admin/users/force-password', labelKey: 'adminDomains.users.forcePassword', implementation: 'users-force-password' },
          { id: 'import', path: '/app/admin/users/import', labelKey: 'adminDomains.users.import', implementation: 'users-import' },
          { id: 'assign-org', path: '/app/admin/users/assign-org', labelKey: 'adminDomains.users.assignOrg', implementation: 'users-assign-org' },
          { id: 'login-history', path: '/app/admin/users/login-history', labelKey: 'adminDomains.users.loginHistory', implementation: 'users-login-history' },
        ],
      },
    ],
  },
  {
    id: 'org-structure',
    path: '/app/admin/org-structure',
    labelKey: 'adminDomains.orgStructure.title',
    icon: 'Building2',
    navAccordion: true,
    // Huy: Domain Cơ cấu tổ chức — implementation ids cho từng màn
    sections: [
      {
        id: 'dynamic',
        labelKey: 'adminDomains.orgStructure.sectionDynamic',
        items: [
          { id: 'levels', path: '/app/admin/org-structure/levels', labelKey: 'adminDomains.orgStructure.levels', end: true, implementation: 'org-levels' },
          { id: 'unit-tree', path: '/app/admin/org-structure/units', labelKey: 'adminDomains.orgStructure.unitTree', implementation: 'org-unit-tree' },
        ],
      },
      {
        id: 'departments',
        labelKey: 'adminDomains.orgStructure.sectionDepartments',
        items: [
          { id: 'dept-list', path: '/app/admin/org-structure/departments', labelKey: 'adminDomains.orgStructure.deptList', end: true, implementation: 'org-dept-list' },
          { id: 'dept-create', path: '/app/admin/org-structure/departments/create', labelKey: 'adminDomains.orgStructure.deptCreate', implementation: 'org-dept-create' },
          { id: 'dept-edit', path: '/app/admin/org-structure/departments/edit', labelKey: 'adminDomains.orgStructure.deptEdit', implementation: 'org-dept-edit' },
          { id: 'dept-disable', path: '/app/admin/org-structure/departments/disable', labelKey: 'adminDomains.orgStructure.deptDisable', implementation: 'org-dept-disable' },
          { id: 'dept-parent', path: '/app/admin/org-structure/departments/parent', labelKey: 'adminDomains.orgStructure.deptParent', implementation: 'org-dept-parent' },
          { id: 'dept-head', path: '/app/admin/org-structure/departments/head', labelKey: 'adminDomains.orgStructure.deptHead', implementation: 'org-dept-head' },
          { id: 'dept-transfer', path: '/app/admin/org-structure/departments/transfer', labelKey: 'adminDomains.orgStructure.deptTransfer', implementation: 'org-dept-transfer' },
        ],
      },
      {
        id: 'teams',
        labelKey: 'adminDomains.orgStructure.sectionTeams',
        items: [
          { id: 'team-list', path: '/app/admin/org-structure/teams', labelKey: 'adminDomains.orgStructure.teamList', end: true, implementation: 'org-team-list' },
          { id: 'team-create', path: '/app/admin/org-structure/teams/create', labelKey: 'adminDomains.orgStructure.teamCreate', implementation: 'org-team-create' },
          { id: 'team-edit', path: '/app/admin/org-structure/teams/edit', labelKey: 'adminDomains.orgStructure.teamEdit', implementation: 'org-team-edit' },
          { id: 'team-archive', path: '/app/admin/org-structure/teams/archive', labelKey: 'adminDomains.orgStructure.teamArchive', implementation: 'org-team-archive' },
          { id: 'team-members', path: '/app/admin/org-structure/teams/members', labelKey: 'adminDomains.orgStructure.teamMembers', implementation: 'org-team-members' },
          { id: 'team-leader', path: '/app/admin/org-structure/teams/leader', labelKey: 'adminDomains.orgStructure.teamLeader', implementation: 'org-team-leader' },
          { id: 'team-dept', path: '/app/admin/org-structure/teams/department', labelKey: 'adminDomains.orgStructure.teamDept', implementation: 'org-team-dept' },
        ],
      },
      {
        id: 'positions',
        labelKey: 'adminDomains.orgStructure.sectionPositions',
        items: [
          { id: 'pos-list', path: '/app/admin/org-structure/positions', labelKey: 'adminDomains.orgStructure.posList', end: true, implementation: 'org-pos-list' },
          { id: 'pos-create', path: '/app/admin/org-structure/positions/create', labelKey: 'adminDomains.orgStructure.posCreate', implementation: 'org-pos-create' },
          { id: 'pos-edit', path: '/app/admin/org-structure/positions/edit', labelKey: 'adminDomains.orgStructure.posEdit', implementation: 'org-pos-edit' },
          { id: 'pos-disable', path: '/app/admin/org-structure/positions/disable', labelKey: 'adminDomains.orgStructure.posDisable', implementation: 'org-pos-disable' },
          { id: 'pos-assign', path: '/app/admin/org-structure/positions/assign', labelKey: 'adminDomains.orgStructure.posAssign', implementation: 'org-pos-assign' },
        ],
      },
      {
        id: 'divisions',
        labelKey: 'adminDomains.orgStructure.sectionDivisions',
        items: [
          { id: 'division-list', path: '/app/admin/org-structure/divisions', labelKey: 'adminDomains.orgStructure.divisionList', end: true, implementation: 'org-division-list' },
          { id: 'division-create', path: '/app/admin/org-structure/divisions/create', labelKey: 'adminDomains.orgStructure.divisionCreate', implementation: 'org-division-create' },
          { id: 'division-edit', path: '/app/admin/org-structure/divisions/edit', labelKey: 'adminDomains.orgStructure.divisionEdit', implementation: 'org-division-edit' },
          { id: 'division-disable', path: '/app/admin/org-structure/divisions/disable', labelKey: 'adminDomains.orgStructure.divisionDisable', implementation: 'org-division-disable' },
          { id: 'division-dept', path: '/app/admin/org-structure/divisions/departments', labelKey: 'adminDomains.orgStructure.divisionDept', implementation: 'org-division-dept' },
        ],
      },
      {
        id: 'branches',
        labelKey: 'adminDomains.orgStructure.sectionBranches',
        items: [
          { id: 'branch-list', path: '/app/admin/org-structure/branches', labelKey: 'adminDomains.orgStructure.branchList', end: true, implementation: 'org-branch-list' },
          { id: 'branch-create', path: '/app/admin/org-structure/branches/create', labelKey: 'adminDomains.orgStructure.branchCreate', implementation: 'org-branch-create' },
          { id: 'branch-edit', path: '/app/admin/org-structure/branches/edit', labelKey: 'adminDomains.orgStructure.branchEdit', implementation: 'org-branch-edit' },
          { id: 'branch-disable', path: '/app/admin/org-structure/branches/disable', labelKey: 'adminDomains.orgStructure.branchDisable', implementation: 'org-branch-disable' },
          { id: 'branch-dept', path: '/app/admin/org-structure/branches/departments', labelKey: 'adminDomains.orgStructure.branchDept', implementation: 'org-branch-dept' },
        ],
      },
    ],
  },
  {
    id: 'rbac',
    path: '/app/admin/rbac',
    labelKey: 'adminDomains.rbac.title',
    icon: 'Shield',
    adminOnly: true,
    sections: [
      {
        id: 'main',
        items: [
          { id: 'roles', path: '/app/admin/rbac/roles', labelKey: 'adminDomains.rbac.roles', end: true, implementation: 'rbac-list' },
          { id: 'hierarchy', path: '/app/admin/rbac/hierarchy', labelKey: 'adminDomains.rbac.hierarchy', implementation: 'rbac-hierarchy' },
          { id: 'create', path: '/app/admin/rbac/create', labelKey: 'adminDomains.rbac.create', implementation: 'rbac-create' },
          { id: 'edit', path: '/app/admin/rbac/edit', labelKey: 'adminDomains.rbac.edit', implementation: 'rbac-edit' },
          { id: 'delete', path: '/app/admin/rbac/delete', labelKey: 'adminDomains.rbac.delete', implementation: 'rbac-delete' },
          { id: 'permissions', path: '/app/admin/rbac/permissions', labelKey: 'adminDomains.rbac.permissions', implementation: 'rbac-permissions' },
          { id: 'assign', path: '/app/admin/rbac/assign', labelKey: 'adminDomains.rbac.assign', implementation: 'rbac-assign' },
          { id: 'revoke', path: '/app/admin/rbac/revoke', labelKey: 'adminDomains.rbac.revoke', implementation: 'rbac-revoke' },
          { id: 'matrix', path: '/app/admin/rbac/matrix', labelKey: 'adminDomains.rbac.matrix', implementation: 'rbac-matrix' },
        ],
      },
    ],
  },
  {
    id: 'channels',
    path: '/app/admin/channels',
    labelKey: 'adminDomains.channels.title',
    icon: 'Hash',
    sections: [
      {
        id: 'main',
        items: [
          { id: 'list', path: '/app/admin/channels', labelKey: 'adminDomains.channels.list', end: true },
          { id: 'edit', path: '/app/admin/channels/edit', labelKey: 'adminDomains.channels.edit' },
          { id: 'archive', path: '/app/admin/channels/archive', labelKey: 'adminDomains.channels.archive' },
          { id: 'restore', path: '/app/admin/channels/restore', labelKey: 'adminDomains.channels.restore' },
          { id: 'transfer', path: '/app/admin/channels/transfer', labelKey: 'adminDomains.channels.transfer' },
          { id: 'members', path: '/app/admin/channels/members', labelKey: 'adminDomains.channels.members' },
          { id: 'visibility', path: '/app/admin/channels/visibility', labelKey: 'adminDomains.channels.visibility' },
        ],
      },
    ],
  },
  {
    id: 'chat',
    path: '/app/admin/chat',
    labelKey: 'adminDomains.chat.title',
    icon: 'MessageSquare',
    sections: [
      {
        id: 'main',
        items: [
          { id: 'history', path: '/app/admin/chat', labelKey: 'adminDomains.chat.history', end: true },
          { id: 'delete', path: '/app/admin/chat/delete', labelKey: 'adminDomains.chat.delete' },
          { id: 'restore', path: '/app/admin/chat/restore', labelKey: 'adminDomains.chat.restore' },
          { id: 'pin', path: '/app/admin/chat/pin', labelKey: 'adminDomains.chat.pin' },
          { id: 'broadcast', path: '/app/admin/chat/broadcast', labelKey: 'adminDomains.chat.broadcast' },
          { id: 'search', path: '/app/admin/chat/search', labelKey: 'adminDomains.chat.search' },
          { id: 'export', path: '/app/admin/chat/export', labelKey: 'adminDomains.chat.export' },
          { id: 'retention', path: '/app/admin/chat/retention', labelKey: 'adminDomains.chat.retention' },
        ],
      },
    ],
  },
  {
    id: 'voice',
    path: '/app/admin/voice',
    labelKey: 'adminDomains.voice.title',
    icon: 'Mic',
    sections: [
      {
        id: 'main',
        items: [
          { id: 'rooms', path: '/app/admin/voice', labelKey: 'adminDomains.voice.rooms', end: true, implementation: 'voice-rooms' },
          { id: 'manage-rooms', path: '/app/admin/voice/manage-rooms', labelKey: 'adminDomains.voice.manageRooms', implementation: 'voice-manage-rooms' },
          { id: 'meetings', path: '/app/admin/voice/meetings', labelKey: 'adminDomains.voice.meetings', implementation: 'voice-meetings' },
          { id: 'end-meeting', path: '/app/admin/voice/end-meeting', labelKey: 'adminDomains.voice.endMeeting', implementation: 'voice-end-meeting' },
          { id: 'moderate', path: '/app/admin/voice/moderate', labelKey: 'adminDomains.voice.moderate', implementation: 'voice-moderate' },
          { id: 'recording', path: '/app/admin/voice/recording', labelKey: 'adminDomains.voice.recording', implementation: 'voice-recording' },
          { id: 'transcript', path: '/app/admin/voice/transcript', labelKey: 'adminDomains.voice.transcript', implementation: 'voice-transcript' },
          { id: 'ai-summary', path: '/app/admin/voice/ai-summary', labelKey: 'adminDomains.voice.aiSummary', implementation: 'voice-ai-summary' },
          { id: 'history', path: '/app/admin/voice/history', labelKey: 'adminDomains.voice.history', implementation: 'voice-history' },
        ],
      },
    ],
  },
  {
    id: 'tasks',
    path: '/app/admin/tasks',
    labelKey: 'adminDomains.tasks.title',
    icon: 'Kanban',
    sections: [
      {
        id: 'main',
        items: [
          { id: 'projects', path: '/app/admin/tasks', labelKey: 'adminDomains.tasks.projects', end: true },
          { id: 'boards', path: '/app/admin/tasks/boards', labelKey: 'adminDomains.tasks.boards' },
          { id: 'sprints', path: '/app/admin/tasks/sprints', labelKey: 'adminDomains.tasks.sprints' },
          { id: 'workflow', path: '/app/admin/tasks/workflow', labelKey: 'adminDomains.tasks.workflow' },
          { id: 'status', path: '/app/admin/tasks/status', labelKey: 'adminDomains.tasks.status' },
          { id: 'priority', path: '/app/admin/tasks/priority', labelKey: 'adminDomains.tasks.priority' },
          { id: 'labels', path: '/app/admin/tasks/labels', labelKey: 'adminDomains.tasks.labels' },
          { id: 'manage-tasks', path: '/app/admin/tasks/manage', labelKey: 'adminDomains.tasks.manageTasks' },
          { id: 'transfer', path: '/app/admin/tasks/transfer', labelKey: 'adminDomains.tasks.transfer' },
          { id: 'export', path: '/app/admin/tasks/export', labelKey: 'adminDomains.tasks.export' },
        ],
      },
    ],
  },
  {
    id: 'files',
    path: '/app/admin/files',
    labelKey: 'adminDomains.files.title',
    icon: 'FolderOpen',
    sections: [
      {
        id: 'main',
        items: [
          { id: 'list', path: '/app/admin/files', labelKey: 'adminDomains.files.list', end: true },
          { id: 'delete', path: '/app/admin/files/delete', labelKey: 'adminDomains.files.delete' },
          { id: 'restore', path: '/app/admin/files/restore', labelKey: 'adminDomains.files.restore' },
          { id: 'storage', path: '/app/admin/files/storage', labelKey: 'adminDomains.files.storage' },
          { id: 'quota', path: '/app/admin/files/quota', labelKey: 'adminDomains.files.quota' },
          { id: 'export', path: '/app/admin/files/export', labelKey: 'adminDomains.files.export' },
        ],
      },
    ],
  },
  {
    id: 'notifications',
    path: '/app/admin/notifications',
    labelKey: 'adminDomains.notifications.title',
    icon: 'Bell',
    sections: [
      {
        id: 'main',
        items: [
          { id: 'smtp', path: '/app/admin/notifications', labelKey: 'adminDomains.notifications.smtp', end: true },
          { id: 'push', path: '/app/admin/notifications/push', labelKey: 'adminDomains.notifications.push' },
          { id: 'webhook', path: '/app/admin/notifications/webhook', labelKey: 'adminDomains.notifications.webhook' },
          { id: 'broadcast', path: '/app/admin/notifications/broadcast', labelKey: 'adminDomains.notifications.broadcast' },
        ],
      },
    ],
  },
  {
    id: 'ai',
    path: '/app/admin/ai',
    labelKey: 'adminDomains.ai.title',
    icon: 'Sparkles',
    sections: [
      {
        id: 'main',
        items: [
          { id: 'provider', path: '/app/admin/ai', labelKey: 'adminDomains.ai.provider', end: true },
          { id: 'api-key', path: '/app/admin/ai/api-key', labelKey: 'adminDomains.ai.apiKey' },
          { id: 'toggle', path: '/app/admin/ai/toggle', labelKey: 'adminDomains.ai.toggle' },
          { id: 'summary', path: '/app/admin/ai/summary', labelKey: 'adminDomains.ai.summary' },
          { id: 'chat', path: '/app/admin/ai/chat', labelKey: 'adminDomains.ai.chat' },
          { id: 'prompts', path: '/app/admin/ai/prompts', labelKey: 'adminDomains.ai.prompts' },
          { id: 'limits', path: '/app/admin/ai/limits', labelKey: 'adminDomains.ai.limits' },
        ],
      },
    ],
  },
  {
    id: 'security',
    path: '/app/admin/security',
    labelKey: 'adminDomains.security.title',
    icon: 'Lock',
    adminOnly: true,
    sections: [
      {
        id: 'main',
        items: [
          { id: 'password-policy', path: '/app/admin/security', labelKey: 'adminDomains.security.passwordPolicy', end: true, implementation: 'settings-security', settingsTab: 'security' },
          { id: 'mfa', path: '/app/admin/security/mfa', labelKey: 'adminDomains.security.mfa' },
          { id: 'sessions', path: '/app/admin/security/sessions', labelKey: 'adminDomains.security.sessions' },
          { id: 'session-timeout', path: '/app/admin/security/session-timeout', labelKey: 'adminDomains.security.sessionTimeout' },
          { id: 'devices', path: '/app/admin/security/devices', labelKey: 'adminDomains.security.devices' },
          { id: 'ip-whitelist', path: '/app/admin/security/ip-whitelist', labelKey: 'adminDomains.security.ipWhitelist' },
          { id: 'login-history', path: '/app/admin/security/login-history', labelKey: 'adminDomains.security.loginHistory' },
        ],
      },
    ],
  },
  {
    id: 'audit',
    path: '/app/admin/audit',
    labelKey: 'adminDomains.audit.title',
    icon: 'ScrollText',
    sections: [
      {
        id: 'main',
        items: [
          { id: 'log', path: '/app/admin/audit', labelKey: 'adminDomains.audit.log', end: true },
          { id: 'search', path: '/app/admin/audit/search', labelKey: 'adminDomains.audit.search' },
          { id: 'permissions', path: '/app/admin/audit/permissions', labelKey: 'adminDomains.audit.permissions' },
          { id: 'login', path: '/app/admin/audit/login', labelKey: 'adminDomains.audit.login' },
          { id: 'activity', path: '/app/admin/audit/activity', labelKey: 'adminDomains.audit.activity' },
          { id: 'export', path: '/app/admin/audit/export', labelKey: 'adminDomains.audit.export' },
        ],
      },
    ],
  },
  {
    id: 'backup',
    path: '/app/admin/backup',
    labelKey: 'adminDomains.backup.title',
    icon: 'Database',
    adminOnly: true,
    sections: [
      {
        id: 'main',
        items: [
          { id: 'backup', path: '/app/admin/backup', labelKey: 'adminDomains.backup.backup', end: true },
          { id: 'restore', path: '/app/admin/backup/restore', labelKey: 'adminDomains.backup.restore' },
          { id: 'export', path: '/app/admin/backup/export', labelKey: 'adminDomains.backup.export' },
          { id: 'import', path: '/app/admin/backup/import', labelKey: 'adminDomains.backup.import' },
          { id: 'schedule', path: '/app/admin/backup/schedule', labelKey: 'adminDomains.backup.schedule' },
        ],
      },
    ],
  },
  {
    id: 'system-config',
    path: '/app/admin/system-config',
    labelKey: 'adminDomains.systemConfig.title',
    icon: 'Settings',
    adminOnly: true,
    sections: [
      {
        id: 'main',
        items: [
          { id: 'company', path: '/app/admin/system-config', labelKey: 'adminDomains.systemConfig.company', end: true, implementation: 'settings-general', settingsTab: 'general' },
          { id: 'logo', path: '/app/admin/system-config/logo', labelKey: 'adminDomains.systemConfig.logo' },
          { id: 'language', path: '/app/admin/system-config/language', labelKey: 'adminDomains.systemConfig.language' },
          { id: 'timezone', path: '/app/admin/system-config/timezone', labelKey: 'adminDomains.systemConfig.timezone' },
          { id: 'work-hours', path: '/app/admin/system-config/work-hours', labelKey: 'adminDomains.systemConfig.workHours' },
          { id: 'holidays', path: '/app/admin/system-config/holidays', labelKey: 'adminDomains.systemConfig.holidays' },
          { id: 'retention', path: '/app/admin/system-config/retention', labelKey: 'adminDomains.systemConfig.retention' },
          { id: 'structure', path: '/app/admin/system-config/structure', labelKey: 'adminDomains.systemConfig.structure', implementation: 'settings-structure', settingsTab: 'structure' },
        ],
      },
    ],
  },
  {
    id: 'monitoring',
    path: '/app/admin/monitoring',
    labelKey: 'adminDomains.monitoring.title',
    icon: 'Activity',
    adminOnly: true,
    sections: [
      {
        id: 'main',
        items: [
          { id: 'services', path: '/app/admin/monitoring', labelKey: 'adminDomains.monitoring.services', end: true },
          { id: 'database', path: '/app/admin/monitoring/database', labelKey: 'adminDomains.monitoring.database' },
          { id: 'queue', path: '/app/admin/monitoring/queue', labelKey: 'adminDomains.monitoring.queue' },
          { id: 'storage', path: '/app/admin/monitoring/storage', labelKey: 'adminDomains.monitoring.storage' },
          { id: 'online-users', path: '/app/admin/monitoring/online-users', labelKey: 'adminDomains.monitoring.onlineUsers' },
          { id: 'voice-active', path: '/app/admin/monitoring/voice-active', labelKey: 'adminDomains.monitoring.voiceActive' },
        ],
      },
    ],
  },
  {
    id: 'reports',
    path: '/app/admin/reports',
    labelKey: 'adminDomains.reports.title',
    icon: 'BarChart3',
    sections: [
      {
        id: 'main',
        items: [
          { id: 'users', path: '/app/admin/reports', labelKey: 'adminDomains.reports.users', end: true },
          { id: 'chat', path: '/app/admin/reports/chat', labelKey: 'adminDomains.reports.chat' },
          { id: 'voice', path: '/app/admin/reports/voice', labelKey: 'adminDomains.reports.voice' },
          { id: 'tasks', path: '/app/admin/reports/tasks', labelKey: 'adminDomains.reports.tasks' },
          { id: 'storage', path: '/app/admin/reports/storage', labelKey: 'adminDomains.reports.storage' },
          { id: 'login', path: '/app/admin/reports/login', labelKey: 'adminDomains.reports.login' },
          { id: 'export', path: '/app/admin/reports/export', labelKey: 'adminDomains.reports.export' },
        ],
      },
    ],
  },
];

/** Map tab cũ (?tab=) sang path mới. */
export const LEGACY_ADMIN_TAB_TO_PATH = {
  overview: '/app/admin',
  people: '/app/admin/users',
  approvals: '/app/admin/users',
  general: '/app/admin/system-config',
  structure: '/app/admin/system-config/structure',
  roles: '/app/admin/rbac/roles',
  policy: '/app/admin/system-config/policy',
  join: '/app/admin/users',
  security: '/app/admin/security',
};

const LEGACY_PATH_REDIRECTS = {
  '/app/admin/people': '/app/admin/users',
  '/app/admin/approvals': '/app/admin/users',
  '/app/admin/users/join-approvals': '/app/admin/users',
  '/app/admin/system-config/policy': '/app/admin/system-config',
  '/app/admin/general': '/app/admin/system-config',
  '/app/admin/structure': '/app/admin/system-config/structure',
  '/app/admin/roles': '/app/admin/rbac/roles',
  '/app/admin/policy': '/app/admin/system-config/policy',
  '/app/admin/security': '/app/admin/security',
};

export function normalizeAdminPath(pathname) {
  const base = String(pathname || '').replace(/\/+$/, '') || '/app/admin';
  return LEGACY_PATH_REDIRECTS[base] || base;
}

export function resolveAdminDomainFromPath(pathname) {
  const path = normalizeAdminPath(pathname);
  if (path === '/app/admin') return null;
  const match = path.match(/^\/app\/admin\/([^/]+)/);
  if (!match) return null;
  const slug = match[1];
  if (slug === 'overview') return null;
  return ADMIN_DOMAINS.find((d) => d.id === slug) || null;
}

export function findAdminNavItem(pathname) {
  const path = normalizeAdminPath(pathname).replace(/\/+$/, '');
  let best = null;
  let bestLen = -1;

  for (const domain of ADMIN_DOMAINS) {
    for (const section of domain.sections) {
      for (const item of section.items) {
        const itemPath = String(item.path || '').replace(/\/+$/, '');
        const matches = item.end ? path === itemPath : path === itemPath || path.startsWith(`${itemPath}/`);
        if (matches && itemPath.length > bestLen) {
          best = { domain, section, item };
          bestLen = itemPath.length;
        }
      }
    }
  }
  return best;
}

export function adminSettingsEmbedTabFromItem(item) {
  return item?.settingsTab || null;
}

export function getVisibleAdminDomains(isFullAccess) {
  return ADMIN_DOMAINS.filter((d) => !d.adminOnly || isFullAccess);
}

export function flattenAdminNavItems(domain) {
  return domain.sections.flatMap((s) => s.items);
}

/** Map OrgLevelSchema.key → admin org-structure section.id */
export const ORG_LEVEL_KEY_TO_SECTION = {
  branch: 'branches',
  division: 'divisions',
  department: 'departments',
  team: 'teams',
};

/** Sections luôn hiện (không gắn level hierarchy). */
export const ORG_STRUCTURE_ALWAYS_SECTIONS = new Set(['dynamic', 'positions']);

/**
 * Lọc sections Cơ cấu tổ chức theo trạng thái setup + levels đã lưu.
 * - Chưa setup (`setupCompleted !== true`): chỉ Positions (tránh menu hierarchy “ảo”).
 * - Đã setup: section theo level; ẩn `dynamic` (Levels) — setup một lần qua modal.
 */
export function filterOrgStructureSections(sections, levels, { setupCompleted } = {}) {
  const list = Array.isArray(sections) ? sections : [];

  if (setupCompleted !== true) {
    return list.filter((section) => section.id === 'positions');
  }

  const enabledKeys = (Array.isArray(levels) ? levels : [])
    .filter((l) => l && l.enabled !== false && l.key)
    .map((l) => String(l.key).toLowerCase().trim());

  const allowed = new Set(['positions']);
  for (const key of enabledKeys) {
    const sectionId = ORG_LEVEL_KEY_TO_SECTION[key];
    if (sectionId) allowed.add(sectionId);
  }

  return list.filter((section) => allowed.has(section.id));
}

/**
 * Domain với sections đã filter (chỉ domain org-structure).
 */
export function applyOrgLevelFilterToDomain(domain, levels, options = {}) {
  if (!domain || domain.id !== 'org-structure') return domain;
  return {
    ...domain,
    sections: filterOrgStructureSections(domain.sections, levels, options),
  };
}
