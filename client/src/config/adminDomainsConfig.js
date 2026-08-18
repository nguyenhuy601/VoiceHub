/**
 * 16 domain quản trị — khung sidebar + route.
 * `implementation` trỏ tới màn đã có; còn lại hiển thị placeholder.
 */

export const ADMIN_SUITE_COLOR = '#EF4444';

export const ADMIN_DOMAIN_STORAGE_KEY = 'vh_admin_active_domain';

/**
 * @typedef {{
 *   id: string,
 *   path: string,
 *   labelKey: string,
 *   end?: boolean,
 *   implementation?: string,
 *   badgeKey?: string,
 *   settingsTab?: string,
 *   nav?: 'link' | 'action' | 'hidden',
 *   actionGroup?: string,
 *   requiredGrant?: string,
 * }} AdminNavItem
 */
/** @typedef {{ id: string, labelKey?: string, items: AdminNavItem[] }} AdminNavSection */

/** Nhóm verb trên sidebar — Users / Accounts / Org / RBAC / Channels / Chat / Voice / Files / Backup. Route không đổi. */
export const ADMIN_NAV_ACTION_GROUPS = {
  peopleOps: { labelKey: 'adminDomains.users.actionGroup' },
  accountOps: { labelKey: 'adminDomains.accounts.actionGroup' },
  deptOps: { labelKey: 'adminDomains.orgStructure.deptActionGroup' },
  teamOps: { labelKey: 'adminDomains.orgStructure.teamActionGroup' },
  divisionOps: { labelKey: 'adminDomains.orgStructure.divisionActionGroup' },
  branchOps: { labelKey: 'adminDomains.orgStructure.branchActionGroup' },
  posOps: { labelKey: 'adminDomains.rbac.posActionGroup' },
  orgRoleOps: { labelKey: 'adminDomains.rbac.orgRoleActionGroup' },
  projectRoleOps: { labelKey: 'adminDomains.rbac.projectRoleActionGroup' },
  permPackOps: { labelKey: 'adminDomains.rbac.permPackActionGroup' },
  channelOps: { labelKey: 'adminDomains.channels.actionGroup' },
  chatOps: { labelKey: 'adminDomains.chat.actionGroup' },
  voiceOps: { labelKey: 'adminDomains.voice.actionGroup' },
  fileOps: { labelKey: 'adminDomains.files.actionGroup' },
  backupOps: { labelKey: 'adminDomains.backup.actionGroup' },
};

/**
 * Giữ thứ tự config: link hiện thẳng; `nav:'action'` gom theo actionGroup; `nav:'hidden'` không lên sidebar (bookmark vẫn resolve).
 * @param {AdminNavItem[]} items
 * @returns {Array<{ type: 'item', item: AdminNavItem } | { type: 'group', id: string, labelKey: string, items: AdminNavItem[] }>}
 */
export function splitNavSectionItems(items = []) {
  const rows = [];
  const groups = new Map();
  for (const item of items) {
    if (item?.nav === 'hidden') continue;
    const groupId = item?.nav === 'action' ? String(item.actionGroup || '').trim() : '';
    if (!groupId) {
      rows.push({ type: 'item', item });
      continue;
    }
    let group = groups.get(groupId);
    if (!group) {
      const meta = ADMIN_NAV_ACTION_GROUPS[groupId];
      group = {
        type: 'group',
        id: groupId,
        labelKey: meta?.labelKey || item.labelKey,
        items: [],
      };
      groups.set(groupId, group);
      rows.push(group);
    }
    group.items.push(item);
  }
  return rows;
}

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
          { id: 'import', path: '/app/admin/users/import', labelKey: 'adminDomains.users.import', implementation: 'users-import-hub' },
          {
            id: 'people-ops',
            path: '/app/admin/users/people-ops',
            labelKey: 'adminDomains.users.peopleOpsHub',
            implementation: 'users-people-ops',
          },
          {
            id: 'edit',
            path: '/app/admin/users/edit',
            labelKey: 'adminDomains.users.edit',
            implementation: 'users-edit',
            nav: 'hidden',
          },
          {
            id: 'assign-org',
            path: '/app/admin/users/assign-org',
            labelKey: 'adminDomains.users.assignOrg',
            implementation: 'users-assign-org',
            nav: 'hidden',
          },
          {
            id: 'delete',
            path: '/app/admin/users/delete',
            labelKey: 'adminDomains.users.delete',
            implementation: 'users-delete',
            nav: 'hidden',
          },
        ],
      },
    ],
  },
  {
    id: 'accounts',
    path: '/app/admin/accounts',
    labelKey: 'adminDomains.accounts.title',
    icon: 'KeyRound',
    sections: [
      {
        id: 'main',
        items: [
          { id: 'list', path: '/app/admin/accounts', labelKey: 'adminDomains.accounts.list', end: true, implementation: 'accounts-list' },
          {
            id: 'password-hub',
            path: '/app/admin/accounts/password',
            labelKey: 'adminDomains.accounts.passwordHub',
            implementation: 'accounts-password-hub',
          },
          {
            id: 'access-hub',
            path: '/app/admin/accounts/access',
            labelKey: 'adminDomains.accounts.accessHub',
            implementation: 'accounts-access-hub',
          },
          {
            id: 'verification-hub',
            path: '/app/admin/accounts/verification',
            labelKey: 'adminDomains.accounts.verificationHub',
            implementation: 'accounts-verification-hub',
          },
          {
            id: 'detail',
            path: '/app/admin/accounts/detail',
            labelKey: 'adminDomains.accounts.detail',
            implementation: 'accounts-detail',
            nav: 'hidden',
          },
          {
            id: 'login-history',
            path: '/app/admin/accounts/login-history',
            labelKey: 'adminDomains.accounts.loginHistory',
            implementation: 'accounts-login-history',
            nav: 'hidden',
          },
          {
            id: 'resend-verification',
            path: '/app/admin/accounts/resend-verification',
            labelKey: 'adminDomains.accounts.resendVerification',
            implementation: 'accounts-resend-verification',
            nav: 'hidden',
          },
          {
            id: 'activate',
            path: '/app/admin/accounts/activate',
            labelKey: 'adminDomains.accounts.activate',
            implementation: 'accounts-activate',
            nav: 'hidden',
          },
          {
            id: 'reset-password',
            path: '/app/admin/accounts/reset-password',
            labelKey: 'adminDomains.accounts.resetPassword',
            implementation: 'accounts-reset-password',
            nav: 'hidden',
          },
          {
            id: 'force-password',
            path: '/app/admin/accounts/force-password',
            labelKey: 'adminDomains.accounts.forcePassword',
            implementation: 'accounts-force-password',
            nav: 'hidden',
          },
          {
            id: 'set-password',
            path: '/app/admin/accounts/set-password',
            labelKey: 'adminDomains.accounts.setPassword',
            implementation: 'accounts-set-password',
            nav: 'hidden',
          },
          {
            id: 'revoke-sessions',
            path: '/app/admin/accounts/revoke-sessions',
            labelKey: 'adminDomains.accounts.revokeSessions',
            implementation: 'accounts-revoke-sessions',
            nav: 'hidden',
          },
          {
            id: 'lock',
            path: '/app/admin/accounts/lock',
            labelKey: 'adminDomains.accounts.lock',
            implementation: 'accounts-lock',
            nav: 'hidden',
          },
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
          { id: 'dept-create', path: '/app/admin/org-structure/departments/create', labelKey: 'adminDomains.orgStructure.deptCreate', implementation: 'org-dept-create', requiredGrant: 'organization.department.create' },
          {
            id: 'dept-manage',
            path: '/app/admin/org-structure/departments/manage',
            labelKey: 'adminDomains.orgStructure.deptManageHub',
            implementation: 'org-dept-manage',
          },
          { id: 'dept-edit', path: '/app/admin/org-structure/departments/edit', labelKey: 'adminDomains.orgStructure.deptEdit', implementation: 'org-dept-edit', nav: 'hidden' },
          { id: 'dept-disable', path: '/app/admin/org-structure/departments/disable', labelKey: 'adminDomains.orgStructure.deptDisable', implementation: 'org-dept-disable', nav: 'hidden' },
          { id: 'dept-parent', path: '/app/admin/org-structure/departments/parent', labelKey: 'adminDomains.orgStructure.deptParent', implementation: 'org-dept-parent', nav: 'hidden' },
          { id: 'dept-head', path: '/app/admin/org-structure/departments/head', labelKey: 'adminDomains.orgStructure.deptHead', implementation: 'org-dept-head', nav: 'hidden' },
          { id: 'dept-members', path: '/app/admin/org-structure/departments/members', labelKey: 'adminDomains.orgStructure.deptMembers', implementation: 'org-dept-members', nav: 'hidden' },
          { id: 'dept-org-roles', path: '/app/admin/org-structure/departments/org-roles', labelKey: 'adminDomains.orgStructure.deptOrgRoles', implementation: 'org-dept-org-roles', nav: 'hidden' },
          { id: 'dept-transfer', path: '/app/admin/org-structure/departments/transfer', labelKey: 'adminDomains.orgStructure.deptTransfer', implementation: 'org-dept-transfer', nav: 'hidden' },
        ],
      },
      {
        id: 'teams',
        labelKey: 'adminDomains.orgStructure.sectionTeams',
        items: [
          { id: 'team-list', path: '/app/admin/org-structure/teams', labelKey: 'adminDomains.orgStructure.teamList', end: true, implementation: 'org-team-list' },
          { id: 'team-create', path: '/app/admin/org-structure/teams/create', labelKey: 'adminDomains.orgStructure.teamCreate', implementation: 'org-team-create', requiredGrant: 'organization.team.create' },
          {
            id: 'team-manage',
            path: '/app/admin/org-structure/teams/manage',
            labelKey: 'adminDomains.orgStructure.teamManageHub',
            implementation: 'org-team-manage',
          },
          { id: 'team-edit', path: '/app/admin/org-structure/teams/edit', labelKey: 'adminDomains.orgStructure.teamEdit', implementation: 'org-team-edit', nav: 'hidden' },
          { id: 'team-archive', path: '/app/admin/org-structure/teams/archive', labelKey: 'adminDomains.orgStructure.teamArchive', implementation: 'org-team-archive', nav: 'hidden' },
          { id: 'team-members', path: '/app/admin/org-structure/teams/members', labelKey: 'adminDomains.orgStructure.teamMembers', implementation: 'org-team-members', nav: 'hidden' },
          { id: 'team-leader', path: '/app/admin/org-structure/teams/leader', labelKey: 'adminDomains.orgStructure.teamLeader', implementation: 'org-team-leader', nav: 'hidden' },
          { id: 'team-dept', path: '/app/admin/org-structure/teams/department', labelKey: 'adminDomains.orgStructure.teamDept', implementation: 'org-team-dept', nav: 'hidden' },
        ],
      },
      {
        id: 'divisions',
        labelKey: 'adminDomains.orgStructure.sectionDivisions',
        items: [
          { id: 'division-list', path: '/app/admin/org-structure/divisions', labelKey: 'adminDomains.orgStructure.divisionList', end: true, implementation: 'org-division-list' },
          { id: 'division-create', path: '/app/admin/org-structure/divisions/create', labelKey: 'adminDomains.orgStructure.divisionCreate', implementation: 'org-division-create' },
          {
            id: 'division-manage',
            path: '/app/admin/org-structure/divisions/manage',
            labelKey: 'adminDomains.orgStructure.divisionManageHub',
            implementation: 'org-division-manage',
          },
          { id: 'division-edit', path: '/app/admin/org-structure/divisions/edit', labelKey: 'adminDomains.orgStructure.divisionEdit', implementation: 'org-division-edit', nav: 'hidden' },
          { id: 'division-disable', path: '/app/admin/org-structure/divisions/disable', labelKey: 'adminDomains.orgStructure.divisionDisable', implementation: 'org-division-disable', nav: 'hidden' },
          { id: 'division-dept', path: '/app/admin/org-structure/divisions/departments', labelKey: 'adminDomains.orgStructure.divisionDept', implementation: 'org-division-dept', nav: 'hidden' },
        ],
      },
      {
        id: 'branches',
        labelKey: 'adminDomains.orgStructure.sectionBranches',
        items: [
          { id: 'branch-list', path: '/app/admin/org-structure/branches', labelKey: 'adminDomains.orgStructure.branchList', end: true, implementation: 'org-branch-list' },
          { id: 'branch-create', path: '/app/admin/org-structure/branches/create', labelKey: 'adminDomains.orgStructure.branchCreate', implementation: 'org-branch-create' },
          {
            id: 'branch-manage',
            path: '/app/admin/org-structure/branches/manage',
            labelKey: 'adminDomains.orgStructure.branchManageHub',
            implementation: 'org-branch-manage',
          },
          { id: 'branch-edit', path: '/app/admin/org-structure/branches/edit', labelKey: 'adminDomains.orgStructure.branchEdit', implementation: 'org-branch-edit', nav: 'hidden' },
          { id: 'branch-disable', path: '/app/admin/org-structure/branches/disable', labelKey: 'adminDomains.orgStructure.branchDisable', implementation: 'org-branch-disable', nav: 'hidden' },
          { id: 'branch-dept', path: '/app/admin/org-structure/branches/departments', labelKey: 'adminDomains.orgStructure.branchDept', implementation: 'org-branch-dept', nav: 'hidden' },
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
    navAccordion: true,
    sections: [
      {
        id: 'overview',
        labelKey: 'adminDomains.rbac.sectionOverview',
        items: [
          {
            id: 'taxonomy',
            path: '/app/admin/rbac',
            labelKey: 'adminDomains.rbac.taxonomy',
            end: true,
            implementation: 'rbac-taxonomy',
          },
          {
            id: 'master-data',
            path: '/app/admin/rbac/master-data',
            labelKey: 'adminDomains.rbac.masterData',
            implementation: 'rbac-master-data',
          },
        ],
      },
      {
        id: 'positions',
        labelKey: 'adminDomains.rbac.sectionPositions',
        items: [
          {
            id: 'pos-list',
            path: '/app/admin/rbac/positions',
            labelKey: 'adminDomains.rbac.posList',
            end: true,
            implementation: 'rbac-pos-list',
          },
          {
            id: 'pos-manage',
            path: '/app/admin/rbac/positions/manage',
            labelKey: 'adminDomains.rbac.posManageHub',
            implementation: 'rbac-pos-manage',
          },
          { id: 'pos-assign', path: '/app/admin/rbac/positions/assign', labelKey: 'adminDomains.rbac.posAssign', implementation: 'rbac-pos-assign', nav: 'hidden' },
          { id: 'pos-edit', path: '/app/admin/rbac/positions/edit', labelKey: 'adminDomains.rbac.posEdit', implementation: 'rbac-pos-edit', nav: 'hidden' },
          { id: 'pos-disable', path: '/app/admin/rbac/positions/disable', labelKey: 'adminDomains.rbac.posDisable', implementation: 'rbac-pos-disable', nav: 'hidden' },
        ],
      },
      {
        id: 'orgRoles',
        labelKey: 'adminDomains.rbac.sectionOrgRoles',
        items: [
          {
            id: 'org-role-list',
            path: '/app/admin/rbac/org-roles',
            labelKey: 'adminDomains.rbac.orgRoleCatalog',
            end: true,
            implementation: 'rbac-org-role-list',
          },
          {
            id: 'org-role-create',
            path: '/app/admin/rbac/org-roles/create',
            labelKey: 'adminDomains.rbac.orgRoleCreate',
            implementation: 'rbac-org-role-create',
          },
          {
            id: 'org-role-directory',
            path: '/app/admin/rbac/org-roles/directory',
            labelKey: 'adminDomains.rbac.orgRoleDirectory',
            implementation: 'rbac-org-role-directory',
          },
          {
            id: 'org-role-lookup',
            path: '/app/admin/rbac/org-roles/lookup',
            labelKey: 'adminDomains.rbac.orgRoleLookup',
            implementation: 'rbac-org-role-lookup',
          },
          {
            id: 'org-role-manage',
            path: '/app/admin/rbac/org-roles/manage',
            labelKey: 'adminDomains.rbac.orgRoleManageHub',
            implementation: 'rbac-org-role-manage',
          },
          { id: 'org-role-edit', path: '/app/admin/rbac/org-roles/edit', labelKey: 'adminDomains.rbac.orgRoleEdit', implementation: 'rbac-org-role-edit', nav: 'hidden' },
          { id: 'org-role-assign', path: '/app/admin/rbac/org-roles/assign', labelKey: 'adminDomains.rbac.orgRoleAssign', implementation: 'rbac-org-role-assign', nav: 'hidden' },
          { id: 'org-role-delete', path: '/app/admin/rbac/org-roles/delete', labelKey: 'adminDomains.rbac.orgRoleDelete', implementation: 'rbac-org-role-delete', nav: 'hidden' },
        ],
      },
      {
        id: 'projectRoles',
        labelKey: 'adminDomains.rbac.sectionProjectRoles',
        items: [
          {
            id: 'project-role-list',
            path: '/app/admin/rbac/project-roles',
            labelKey: 'adminDomains.rbac.projectRoleCatalog',
            implementation: 'rbac-project-role-list',
            end: true,
          },
          {
            id: 'project-role-create',
            path: '/app/admin/rbac/project-roles/create',
            labelKey: 'adminDomains.rbac.projectRoleCreate',
            implementation: 'rbac-project-role-create',
          },
          {
            id: 'project-role-board',
            path: '/app/admin/rbac/project-roles/board',
            labelKey: 'adminDomains.rbac.projectRoleBoard',
            implementation: 'rbac-project-role-board',
          },
          {
            id: 'project-role-manage',
            path: '/app/admin/rbac/project-roles/manage',
            labelKey: 'adminDomains.rbac.projectRoleManageHub',
            implementation: 'rbac-project-role-manage',
          },
          { id: 'project-role-edit', path: '/app/admin/rbac/project-roles/edit', labelKey: 'adminDomains.rbac.projectRoleEdit', implementation: 'rbac-project-role-edit', nav: 'hidden' },
          { id: 'project-role-delete', path: '/app/admin/rbac/project-roles/delete', labelKey: 'adminDomains.rbac.projectRoleDelete', implementation: 'rbac-project-role-delete', nav: 'hidden' },
        ],
      },
      {
        // id path giữ systemRoles (URL /rbac/roles); copy UI = Permission / Gói quyền.
        id: 'systemRoles',
        labelKey: 'adminDomains.rbac.sectionSystemRoles',
        items: [
          { id: 'roles', path: '/app/admin/rbac/roles', labelKey: 'adminDomains.rbac.roles', implementation: 'rbac-list' },
          { id: 'create', path: '/app/admin/rbac/create', labelKey: 'adminDomains.rbac.create', implementation: 'rbac-create' },
          { id: 'permissions', path: '/app/admin/rbac/permissions', labelKey: 'adminDomains.rbac.permissions', implementation: 'rbac-permissions' },
          { id: 'hierarchy', path: '/app/admin/rbac/hierarchy', labelKey: 'adminDomains.rbac.hierarchy', implementation: 'rbac-hierarchy' },
          { id: 'matrix', path: '/app/admin/rbac/matrix', labelKey: 'adminDomains.rbac.matrix', implementation: 'rbac-matrix' },
          {
            id: 'perm-pack-manage',
            path: '/app/admin/rbac/roles/manage',
            labelKey: 'adminDomains.rbac.permPackManageHub',
            implementation: 'rbac-perm-pack-manage',
          },
          { id: 'assign', path: '/app/admin/rbac/assign', labelKey: 'adminDomains.rbac.assign', implementation: 'rbac-assign', nav: 'hidden' },
          { id: 'revoke', path: '/app/admin/rbac/revoke', labelKey: 'adminDomains.rbac.revoke', implementation: 'rbac-revoke', nav: 'hidden' },
          { id: 'delete', path: '/app/admin/rbac/delete', labelKey: 'adminDomains.rbac.delete', implementation: 'rbac-delete', nav: 'hidden' },
          {
            id: 'edit',
            path: '/app/admin/rbac/edit',
            labelKey: 'adminDomains.rbac.edit',
            implementation: 'rbac-edit',
            nav: 'hidden',
          },
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
          { id: 'list', path: '/app/admin/channels', labelKey: 'adminDomains.channels.list', end: true, implementation: 'channels-list' },
          {
            id: 'channel-manage',
            path: '/app/admin/channels/manage',
            labelKey: 'adminDomains.channels.manageHub',
            implementation: 'channels-manage',
          },
          {
            id: 'edit',
            path: '/app/admin/channels/edit',
            labelKey: 'adminDomains.channels.edit',
            implementation: 'channels-manage',
            nav: 'hidden',
          },
          {
            id: 'restore',
            path: '/app/admin/channels/restore',
            labelKey: 'adminDomains.channels.restore',
            implementation: 'channels-manage',
            nav: 'hidden',
          },
          {
            id: 'transfer',
            path: '/app/admin/channels/transfer',
            labelKey: 'adminDomains.channels.transfer',
            implementation: 'channels-manage',
            nav: 'hidden',
          },
          {
            id: 'members',
            path: '/app/admin/channels/members',
            labelKey: 'adminDomains.channels.members',
            implementation: 'channels-manage',
            nav: 'hidden',
          },
          {
            id: 'visibility',
            path: '/app/admin/channels/visibility',
            labelKey: 'adminDomains.channels.visibility',
            implementation: 'channels-manage',
            nav: 'hidden',
          },
          {
            id: 'archive',
            path: '/app/admin/channels/archive',
            labelKey: 'adminDomains.channels.archive',
            implementation: 'channels-manage',
            nav: 'hidden',
          },
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
          {
            id: 'config-hub',
            path: '/app/admin/chat',
            labelKey: 'adminDomains.chat.configHub',
            end: true,
            implementation: 'chat-config',
          },
          { id: 'history', path: '/app/admin/chat/history', labelKey: 'adminDomains.chat.history', implementation: 'chat-config', nav: 'hidden' },
          { id: 'restore', path: '/app/admin/chat/restore', labelKey: 'adminDomains.chat.restore', implementation: 'chat-config', nav: 'hidden' },
          { id: 'pin', path: '/app/admin/chat/pin', labelKey: 'adminDomains.chat.pin', implementation: 'chat-config', nav: 'hidden' },
          { id: 'broadcast', path: '/app/admin/chat/broadcast', labelKey: 'adminDomains.chat.broadcast', implementation: 'chat-config', nav: 'hidden' },
          { id: 'search', path: '/app/admin/chat/search', labelKey: 'adminDomains.chat.search', implementation: 'chat-config', nav: 'hidden' },
          { id: 'export', path: '/app/admin/chat/export', labelKey: 'adminDomains.chat.export', implementation: 'chat-config', nav: 'hidden' },
          { id: 'retention', path: '/app/admin/chat/retention', labelKey: 'adminDomains.chat.retention', implementation: 'chat-config', nav: 'hidden' },
          { id: 'delete', path: '/app/admin/chat/delete', labelKey: 'adminDomains.chat.delete', implementation: 'chat-config', nav: 'hidden' },
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
          {
            id: 'manage-rooms',
            path: '/app/admin/voice/manage-rooms',
            labelKey: 'adminDomains.voice.manageRooms',
            implementation: 'voice-manage-rooms',
          },
          {
            id: 'meetings',
            path: '/app/admin/voice/meetings',
            labelKey: 'adminDomains.voice.meetings',
            implementation: 'voice-meetings',
          },
          {
            id: 'history',
            path: '/app/admin/voice/history',
            labelKey: 'adminDomains.voice.history',
            implementation: 'voice-history',
          },
          {
            id: 'meeting-ops',
            path: '/app/admin/voice/meeting-ops',
            labelKey: 'adminDomains.voice.meetingOpsHub',
            implementation: 'voice-meeting-ops',
          },
          { id: 'recording', path: '/app/admin/voice/recording', labelKey: 'adminDomains.voice.recording', implementation: 'voice-recording', nav: 'hidden' },
          { id: 'transcript', path: '/app/admin/voice/transcript', labelKey: 'adminDomains.voice.transcript', implementation: 'voice-transcript', nav: 'hidden' },
          { id: 'ai-summary', path: '/app/admin/voice/ai-summary', labelKey: 'adminDomains.voice.aiSummary', implementation: 'voice-ai-summary', nav: 'hidden' },
          { id: 'moderate', path: '/app/admin/voice/moderate', labelKey: 'adminDomains.voice.moderate', implementation: 'voice-moderate', nav: 'hidden' },
          { id: 'end-meeting', path: '/app/admin/voice/end-meeting', labelKey: 'adminDomains.voice.endMeeting', implementation: 'voice-end-meeting', nav: 'hidden' },
        ],
      },
    ],
  },
  {
    id: 'projects',
    path: '/app/admin/projects',
    labelKey: 'adminDomains.projects.title',
    icon: 'Kanban',
    navAccordion: true,
    sections: [
      {
        id: 'governance',
        labelKey: 'adminDomains.projects.sectionGovernance',
        items: [
          {
            id: 'overview',
            path: '/app/admin/projects',
            labelKey: 'adminDomains.projects.overview',
            end: true,
            implementation: 'tasks-boards',
          },
          {
            id: 'settings',
            path: '/app/admin/projects/settings',
            labelKey: 'adminDomains.projects.settings',
            implementation: 'tasks-project-settings',
          },
          {
            id: 'project-team',
            path: '/app/admin/projects/project-team',
            labelKey: 'adminDomains.projects.members',
            implementation: 'tasks-project-team',
          },
          {
            id: 'delegation',
            path: '/app/admin/projects/delegation',
            labelKey: 'adminDomains.projects.delegation',
            implementation: 'tasks-delegation',
          },
        ],
      },
      {
        id: 'boards-delivery',
        labelKey: 'adminDomains.projects.sectionBoards',
        items: [
          {
            id: 'boards',
            path: '/app/admin/projects/boards',
            labelKey: 'adminDomains.projects.boards',
            implementation: 'tasks-boards',
          },
          {
            id: 'workflow',
            path: '/app/admin/projects/workflow',
            labelKey: 'adminDomains.projects.workflow',
            implementation: 'tasks-workflow',
          },
          {
            id: 'sprints',
            path: '/app/admin/projects/sprints',
            labelKey: 'adminDomains.projects.sprints',
            implementation: 'tasks-sprints',
          },
        ],
      },
      {
        id: 'work-items',
        labelKey: 'adminDomains.projects.sectionWorkItems',
        items: [
          {
            id: 'manage-tasks',
            path: '/app/admin/projects/manage',
            labelKey: 'adminDomains.projects.manageTasks',
            implementation: 'tasks-manage',
          },
          {
            id: 'change-requests',
            path: '/app/admin/projects/change-requests',
            labelKey: 'adminDomains.projects.changeRequests',
            implementation: 'tasks-change-requests',
          },
          {
            id: 'briefs',
            path: '/app/admin/projects/briefs',
            labelKey: 'adminDomains.projects.briefs',
            implementation: 'tasks-briefs',
          },
          {
            id: 'export',
            path: '/app/admin/projects/export',
            labelKey: 'adminDomains.projects.export',
            implementation: 'tasks-export',
          },
          {
            id: 'status',
            path: '/app/admin/projects/status',
            labelKey: 'adminDomains.projects.status',
            implementation: 'tasks-status-priority',
          },
          {
            id: 'priority',
            path: '/app/admin/projects/priority',
            labelKey: 'adminDomains.projects.priority',
            implementation: 'tasks-status-priority',
          },
          {
            id: 'labels',
            path: '/app/admin/projects/labels',
            labelKey: 'adminDomains.projects.labels',
            implementation: 'tasks-manage',
          },
        ],
      },
      {
        id: 'ops',
        labelKey: 'adminDomains.projects.sectionOps',
        items: [
          {
            id: 'transfer',
            path: '/app/admin/projects/transfer',
            labelKey: 'adminDomains.projects.transfer',
            implementation: 'tasks-transfer',
          },
          {
            id: 'policies',
            path: '/app/admin/projects/policies',
            labelKey: 'adminDomains.projects.policies',
            implementation: 'tasks-project-visibility-policy',
          },
          {
            id: 'capacity',
            path: '/app/admin/projects/capacity',
            labelKey: 'adminDomains.projects.capacity',
            implementation: 'tasks-department-capacity',
          },
          {
            id: 'planner',
            path: '/app/admin/projects/planner',
            labelKey: 'adminDomains.projects.planner',
            implementation: 'tasks-resource-planner',
          },
          {
            id: 'utilization',
            path: '/app/admin/projects/utilization',
            labelKey: 'adminDomains.projects.utilization',
            implementation: 'tasks-utilization',
          },
          {
            id: 'approval-policies',
            path: '/app/admin/projects/approval-policies',
            labelKey: 'adminDomains.projects.approvalPolicies',
            implementation: 'tasks-approval-policies',
          },
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
          { id: 'list', path: '/app/admin/files', labelKey: 'adminDomains.files.list', end: true, implementation: 'files-list' },
          { id: 'storage', path: '/app/admin/files/storage', labelKey: 'adminDomains.files.storage' },
          { id: 'quota', path: '/app/admin/files/quota', labelKey: 'adminDomains.files.quota' },
          {
            id: 'file-ops',
            path: '/app/admin/files/ops',
            labelKey: 'adminDomains.files.opsHub',
            implementation: 'files-ops',
          },
          {
            id: 'restore',
            path: '/app/admin/files/restore',
            labelKey: 'adminDomains.files.restore',
            implementation: 'files-ops',
            nav: 'hidden',
          },
          {
            id: 'export',
            path: '/app/admin/files/export',
            labelKey: 'adminDomains.files.export',
            implementation: 'files-ops',
            nav: 'hidden',
          },
          {
            id: 'delete',
            path: '/app/admin/files/delete',
            labelKey: 'adminDomains.files.delete',
            implementation: 'files-ops',
            nav: 'hidden',
          },
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
          {
            id: 'config-hub',
            path: '/app/admin/notifications',
            labelKey: 'adminDomains.notifications.configHub',
            end: true,
            implementation: 'notifications-config',
          },
          { id: 'smtp', path: '/app/admin/notifications/smtp', labelKey: 'adminDomains.notifications.smtp', implementation: 'notifications-config', nav: 'hidden' },
          { id: 'push', path: '/app/admin/notifications/push', labelKey: 'adminDomains.notifications.push', implementation: 'notifications-config', nav: 'hidden' },
          { id: 'webhook', path: '/app/admin/notifications/webhook', labelKey: 'adminDomains.notifications.webhook', implementation: 'notifications-config', nav: 'hidden' },
          { id: 'broadcast', path: '/app/admin/notifications/broadcast', labelKey: 'adminDomains.notifications.broadcast', implementation: 'notifications-config', nav: 'hidden' },
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
          {
            id: 'settings-hub',
            path: '/app/admin/security',
            labelKey: 'adminDomains.security.settingsHub',
            end: true,
            implementation: 'security-settings-hub',
          },
          {
            id: 'sessions-hub',
            path: '/app/admin/security/sessions',
            labelKey: 'adminDomains.security.sessionsHub',
            implementation: 'security-sessions-hub',
          },
          { id: 'password-policy', path: '/app/admin/security/password-policy', labelKey: 'adminDomains.security.passwordPolicy', implementation: 'settings-security', settingsTab: 'security', nav: 'hidden' },
          { id: 'mfa', path: '/app/admin/security/mfa', labelKey: 'adminDomains.security.mfa', implementation: 'security-wave-c', nav: 'hidden' },
          { id: 'session-timeout', path: '/app/admin/security/session-timeout', labelKey: 'adminDomains.security.sessionTimeout', nav: 'hidden' },
          { id: 'devices', path: '/app/admin/security/devices', labelKey: 'adminDomains.security.devices', nav: 'hidden' },
          { id: 'ip-whitelist', path: '/app/admin/security/ip-whitelist', labelKey: 'adminDomains.security.ipWhitelist', implementation: 'security-wave-c', nav: 'hidden' },
          { id: 'login-history', path: '/app/admin/security/login-history', labelKey: 'adminDomains.security.loginHistory', nav: 'hidden' },
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
          { id: 'log', path: '/app/admin/audit', labelKey: 'adminDomains.audit.log', implementation: 'audit-log' },
          {
            id: 'search',
            path: '/app/admin/audit/search',
            labelKey: 'adminDomains.audit.search',
            implementation: 'audit-log',
            nav: 'hidden',
          },
          {
            id: 'permissions',
            path: '/app/admin/audit/permissions',
            labelKey: 'adminDomains.audit.permissions',
            implementation: 'audit-log',
            nav: 'hidden',
          },
          {
            id: 'login',
            path: '/app/admin/audit/login',
            labelKey: 'adminDomains.audit.login',
            implementation: 'audit-log',
            nav: 'hidden',
          },
          {
            id: 'activity',
            path: '/app/admin/audit/activity',
            labelKey: 'adminDomains.audit.activity',
            implementation: 'audit-log',
            nav: 'hidden',
          },
          {
            id: 'export',
            path: '/app/admin/audit/export',
            labelKey: 'adminDomains.audit.export',
            implementation: 'audit-log',
            nav: 'hidden',
          },
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
          { id: 'backup', path: '/app/admin/backup', labelKey: 'adminDomains.backup.backup', end: true, implementation: 'backup-ops' },
          { id: 'schedule', path: '/app/admin/backup/schedule', labelKey: 'adminDomains.backup.schedule', implementation: 'backup-ops' },
          {
            id: 'export',
            path: '/app/admin/backup/export',
            labelKey: 'adminDomains.backup.export',
            implementation: 'backup-ops',
            nav: 'action',
            actionGroup: 'backupOps',
          },
          {
            id: 'import',
            path: '/app/admin/backup/import',
            labelKey: 'adminDomains.backup.import',
            implementation: 'backup-ops',
            nav: 'action',
            actionGroup: 'backupOps',
          },
          {
            id: 'restore',
            path: '/app/admin/backup/restore',
            labelKey: 'adminDomains.backup.restore',
            implementation: 'backup-ops',
            nav: 'action',
            actionGroup: 'backupOps',
          },
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
          {
            id: 'config-hub',
            path: '/app/admin/system-config',
            labelKey: 'adminDomains.systemConfig.configHub',
            end: true,
            implementation: 'system-config-hub',
          },
          { id: 'company', path: '/app/admin/system-config/company', labelKey: 'adminDomains.systemConfig.company', implementation: 'settings-general', settingsTab: 'general', nav: 'hidden' },
          { id: 'logo', path: '/app/admin/system-config/logo', labelKey: 'adminDomains.systemConfig.logo', nav: 'hidden' },
          { id: 'language', path: '/app/admin/system-config/language', labelKey: 'adminDomains.systemConfig.language', nav: 'hidden' },
          { id: 'timezone', path: '/app/admin/system-config/timezone', labelKey: 'adminDomains.systemConfig.timezone', nav: 'hidden' },
          { id: 'work-hours', path: '/app/admin/system-config/work-hours', labelKey: 'adminDomains.systemConfig.workHours', nav: 'hidden' },
          { id: 'holidays', path: '/app/admin/system-config/holidays', labelKey: 'adminDomains.systemConfig.holidays', nav: 'hidden' },
          { id: 'retention', path: '/app/admin/system-config/retention', labelKey: 'adminDomains.systemConfig.retention', implementation: 'governance-retention', nav: 'hidden' },
          { id: 'structure', path: '/app/admin/system-config/structure', labelKey: 'adminDomains.systemConfig.structure', implementation: 'settings-structure', settingsTab: 'structure', nav: 'hidden' },
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
          { id: 'tasks', path: '/app/admin/reports/tasks', labelKey: 'adminDomains.reports.tasks', implementation: 'director-project-health' },
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
  structure: '/app/admin/system-config?tab=structure',
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
  '/app/admin/structure': '/app/admin/system-config?tab=structure',
  '/app/admin/roles': '/app/admin/rbac/roles',
  '/app/admin/policy': '/app/admin/system-config/policy',
  '/app/admin/security': '/app/admin/security',
  '/app/admin/org-structure/positions': '/app/admin/rbac/positions',
  '/app/admin/org-structure/positions/create': '/app/admin/rbac/master-data',
  '/app/admin/rbac/positions/create': '/app/admin/rbac/master-data',
  '/app/admin/org-structure/positions/edit': '/app/admin/rbac/positions/edit',
  '/app/admin/org-structure/positions/disable': '/app/admin/rbac/positions/disable',
  '/app/admin/org-structure/positions/assign': '/app/admin/rbac/positions/assign',

  '/app/admin/rbac/organization-roles': '/app/admin/rbac/org-roles',
  '/app/admin/rbac/organization-roles/directory': '/app/admin/rbac/org-roles/directory',
  '/app/admin/rbac/organization-roles/lookup': '/app/admin/rbac/org-roles/lookup',

  '/app/admin/users/lock': '/app/admin/accounts/access?tab=lock',
  '/app/admin/users/reset-password': '/app/admin/accounts/password?tab=reset',
  '/app/admin/users/force-password': '/app/admin/accounts/password?tab=force',
  '/app/admin/users/login-history': '/app/admin/accounts/login-history',
  '/app/admin/users/edit': '/app/admin/users/people-ops?tab=edit',
  '/app/admin/users/assign-org': '/app/admin/users/people-ops?tab=assign-org',
  '/app/admin/users/delete': '/app/admin/users/people-ops?tab=delete',
  '/app/admin/users/import-excel': '/app/admin/users/import',
  '/app/admin/accounts/reset-password': '/app/admin/accounts/password?tab=reset',
  '/app/admin/accounts/force-password': '/app/admin/accounts/password?tab=force',
  '/app/admin/accounts/set-password': '/app/admin/accounts/password?tab=set',
  '/app/admin/accounts/activate': '/app/admin/accounts/access?tab=activate',
  '/app/admin/accounts/lock': '/app/admin/accounts/access?tab=lock',
  '/app/admin/accounts/revoke-sessions': '/app/admin/accounts/access?tab=revoke',
  '/app/admin/accounts/resend-verification': '/app/admin/accounts/verification?tab=resend',

  '/app/admin/org-structure/departments/edit': '/app/admin/org-structure/departments/manage?tab=edit',
  '/app/admin/org-structure/departments/disable': '/app/admin/org-structure/departments/manage?tab=disable',
  '/app/admin/org-structure/departments/parent': '/app/admin/org-structure/departments/manage?tab=parent',
  '/app/admin/org-structure/departments/head': '/app/admin/org-structure/departments/manage?tab=head',
  '/app/admin/org-structure/departments/members': '/app/admin/org-structure/departments/manage?tab=members',
  '/app/admin/org-structure/departments/org-roles': '/app/admin/org-structure/departments/manage?tab=org-roles',
  '/app/admin/org-structure/departments/transfer': '/app/admin/org-structure/departments/manage?tab=transfer',
  '/app/admin/org-structure/teams/edit': '/app/admin/org-structure/teams/manage?tab=edit',
  '/app/admin/org-structure/teams/archive': '/app/admin/org-structure/teams/manage?tab=archive',
  '/app/admin/org-structure/teams/members': '/app/admin/org-structure/teams/manage?tab=members',
  '/app/admin/org-structure/teams/leader': '/app/admin/org-structure/teams/manage?tab=leader',
  '/app/admin/org-structure/teams/department': '/app/admin/org-structure/teams/manage?tab=department',
  '/app/admin/org-structure/divisions/edit': '/app/admin/org-structure/divisions/manage?tab=edit',
  '/app/admin/org-structure/divisions/disable': '/app/admin/org-structure/divisions/manage?tab=disable',
  '/app/admin/org-structure/divisions/departments': '/app/admin/org-structure/divisions/manage?tab=departments',
  '/app/admin/org-structure/branches/edit': '/app/admin/org-structure/branches/manage?tab=edit',
  '/app/admin/org-structure/branches/disable': '/app/admin/org-structure/branches/manage?tab=disable',
  '/app/admin/org-structure/branches/departments': '/app/admin/org-structure/branches/manage?tab=departments',

  '/app/admin/rbac/positions/assign': '/app/admin/rbac/positions/manage?tab=assign',
  '/app/admin/rbac/positions/edit': '/app/admin/rbac/positions/manage?tab=edit',
  '/app/admin/rbac/positions/disable': '/app/admin/rbac/positions/manage?tab=disable',
  '/app/admin/rbac/org-roles/edit': '/app/admin/rbac/org-roles/manage?tab=edit',
  '/app/admin/rbac/org-roles/assign': '/app/admin/rbac/org-roles/manage?tab=assign',
  '/app/admin/rbac/org-roles/delete': '/app/admin/rbac/org-roles/manage?tab=delete',
  '/app/admin/rbac/project-roles/edit': '/app/admin/rbac/project-roles/manage?tab=edit',
  '/app/admin/rbac/project-roles/delete': '/app/admin/rbac/project-roles/manage?tab=delete',
  '/app/admin/rbac/assign': '/app/admin/rbac/roles/manage?tab=assign',
  '/app/admin/rbac/revoke': '/app/admin/rbac/roles/manage?tab=revoke',
  '/app/admin/rbac/delete': '/app/admin/rbac/roles/manage?tab=delete',

  '/app/admin/voice/recording': '/app/admin/voice/meeting-ops?tab=recording',
  '/app/admin/voice/transcript': '/app/admin/voice/meeting-ops?tab=transcript',
  '/app/admin/voice/ai-summary': '/app/admin/voice/meeting-ops?tab=summary',
  '/app/admin/voice/moderate': '/app/admin/voice/meeting-ops?tab=moderate',
  '/app/admin/voice/end-meeting': '/app/admin/voice/meeting-ops?tab=end',

  '/app/admin/channels/edit': '/app/admin/channels/manage?tab=edit',
  '/app/admin/channels/members': '/app/admin/channels/manage?tab=members',
  '/app/admin/channels/visibility': '/app/admin/channels/manage?tab=visibility',
  '/app/admin/channels/transfer': '/app/admin/channels/manage?tab=transfer',
  '/app/admin/channels/archive': '/app/admin/channels/manage?tab=archive',
  '/app/admin/channels/restore': '/app/admin/channels/manage?tab=restore',

  '/app/admin/files/restore': '/app/admin/files/ops?tab=restore',
  '/app/admin/files/export': '/app/admin/files/ops?tab=export',
  '/app/admin/files/delete': '/app/admin/files/ops?tab=delete',

  '/app/admin/chat/history': '/app/admin/chat?tab=history',
  '/app/admin/chat/restore': '/app/admin/chat?tab=restore',
  '/app/admin/chat/pin': '/app/admin/chat?tab=pin',
  '/app/admin/chat/broadcast': '/app/admin/chat?tab=broadcast',
  '/app/admin/chat/search': '/app/admin/chat?tab=search',
  '/app/admin/chat/export': '/app/admin/chat?tab=export',
  '/app/admin/chat/retention': '/app/admin/chat?tab=retention',
  '/app/admin/chat/delete': '/app/admin/chat?tab=delete',

  '/app/admin/notifications/smtp': '/app/admin/notifications?tab=smtp',
  '/app/admin/notifications/push': '/app/admin/notifications?tab=push',
  '/app/admin/notifications/webhook': '/app/admin/notifications?tab=webhook',
  '/app/admin/notifications/broadcast': '/app/admin/notifications?tab=broadcast',

  '/app/admin/security/password-policy': '/app/admin/security?tab=password',
  '/app/admin/security/mfa': '/app/admin/security?tab=mfa',
  '/app/admin/security/session-timeout': '/app/admin/security?tab=session-timeout',
  '/app/admin/security/ip-whitelist': '/app/admin/security?tab=ip-whitelist',
  '/app/admin/security/devices': '/app/admin/security/sessions?tab=devices',
  '/app/admin/security/login-history': '/app/admin/security/sessions?tab=history',

  '/app/admin/system-config/company': '/app/admin/system-config?tab=company',
  '/app/admin/system-config/logo': '/app/admin/system-config?tab=logo',
  '/app/admin/system-config/language': '/app/admin/system-config?tab=language',
  '/app/admin/system-config/timezone': '/app/admin/system-config?tab=timezone',
  '/app/admin/system-config/work-hours': '/app/admin/system-config?tab=work-hours',
  '/app/admin/system-config/holidays': '/app/admin/system-config?tab=holidays',
  '/app/admin/system-config/retention': '/app/admin/system-config?tab=retention',
  '/app/admin/system-config/structure': '/app/admin/system-config?tab=structure',
};

/** Redirect kèm query (ví dụ create → import?mode=invite). */
const LEGACY_PATH_REDIRECTS_WITH_SEARCH = {
  '/app/admin/users/create': '/app/admin/users/import?mode=invite',
  '/app/admin/users/import-excel': '/app/admin/users/import?mode=excel',
};

export function normalizeAdminPath(pathname) {
  const base = String(pathname || '').replace(/\/+$/, '') || '/app/admin';
  const mapped = LEGACY_PATH_REDIRECTS[base];
  if (mapped) {
    const q = mapped.indexOf('?');
    return q === -1 ? mapped : mapped.slice(0, q);
  }
  // Legacy Admin Tasks → Projects & Delivery (giữ slug con)
  if (base === '/app/admin/tasks' || base.startsWith('/app/admin/tasks/')) {
    return base.replace(/^\/app\/admin\/tasks/, '/app/admin/projects');
  }
  return base;
}

/** @returns {{ pathname: string, search: string } | null} */
export function resolveAdminLegacyRedirect(pathname, currentSearch = '') {
  const base = String(pathname || '').replace(/\/+$/, '') || '/app/admin';
  const withSearch = LEGACY_PATH_REDIRECTS_WITH_SEARCH[base];
  if (withSearch) {
    const q = withSearch.indexOf('?');
    if (q === -1) return { pathname: withSearch, search: '' };
    return { pathname: withSearch.slice(0, q), search: withSearch.slice(q) };
  }
  const plain = LEGACY_PATH_REDIRECTS[base];
  if (plain && plain !== base) {
    const q = plain.indexOf('?');
    if (q === -1) {
      return { pathname: plain, search: String(currentSearch || '') };
    }
    const pathname = plain.slice(0, q);
    const redirectSearch = new URLSearchParams(plain.slice(q + 1));
    const incoming = new URLSearchParams(String(currentSearch || '').replace(/^\?/, ''));
    for (const key of ['userId', 'unitId', 'meetingId', 'roleId', 'title', 'channelId', 'fileId']) {
      if (incoming.has(key)) redirectSearch.set(key, incoming.get(key));
    }
    const merged = redirectSearch.toString();
    return { pathname, search: merged ? `?${merged}` : '' };
  }
  return null;
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
export const ORG_STRUCTURE_ALWAYS_SECTIONS = new Set(['dynamic']);

/**
 * Lọc sections Cơ cấu tổ chức theo trạng thái setup + levels đã lưu.
 * - Chưa setup (`setupCompleted !== true`): ẩn hierarchy (modal setup tự mở).
 * - Đã setup: section theo level; ẩn `dynamic` (Levels) — setup một lần qua modal.
 */
export function filterOrgStructureSections(sections, levels, { setupCompleted } = {}) {
  const list = Array.isArray(sections) ? sections : [];

  if (setupCompleted !== true) {
    return [];
  }

  const enabledKeys = (Array.isArray(levels) ? levels : [])
    .filter((l) => l && l.enabled !== false && l.key)
    .map((l) => String(l.key).toLowerCase().trim());

  const allowed = new Set();
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
