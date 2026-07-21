/**
 * Bốn lớp + Responsibility (People vs Delivery vs Ops).
 *
 * - Position / HR Role: Senior Backend, QA… — hồ sơ nhân sự; CẤM dùng phân quyền / assign.
 * - Organization Role: Department Manager, Team Manager, Director — People Graph.
 * - Project Role: Tech Lead, Developer… — trong Project; Delegation Graph / CanAssign.
 * - Permission: quyền thao tác cụ thể — gắn qua System Role (= nhóm Permission).
 * - Responsibility: phạm vi chuyên môn/module — gợi ý assignee; không grant permission.
 *
 * System/Tenant membership (owner|admin|hr|member) vận hành tenant, không phải Organization Role phòng ban.
 */

const ROLE_KIND = Object.freeze({
  HR: 'hr_role',
  ORGANIZATION: 'organization_role',
  PROJECT: 'project_role',
  SYSTEM: 'system_membership',
  RESPONSIBILITY: 'responsibility',
});

/** Organization Role keys (People Graph). */
const ORGANIZATION_ROLE_KEYS = Object.freeze({
  DEPARTMENT_MANAGER: 'department_manager',
  TEAM_MANAGER: 'team_manager',
  DIRECTOR: 'director',
});

/**
 * Nợ P0→P1: historically `department_head` map → admin (System).
 * Authorize mới KHÔNG được suy System admin từ alias này — dùng Organization Role.
 */
const LEGACY_MEMBERSHIP_ALIAS_DEBT = Object.freeze({
  department_head: {
    wasMappedTo: 'admin',
    correctKind: ROLE_KIND.ORGANIZATION,
    correctKey: ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER,
    note: 'Do not elevate to system admin; resolve via Organization Role on People Graph.',
  },
  team_leader: {
    wasMappedTo: 'member',
    correctKind: ROLE_KIND.ORGANIZATION,
    correctKey: ORGANIZATION_ROLE_KEYS.TEAM_MANAGER,
    note: 'Team.leader is Organization Role, not Project Role / assign authority.',
  },
});

const DEFAULT_HR_ROLE_KEYS = Object.freeze([
  'senior_backend',
  'junior',
  'qa',
  'architect',
  'senior_frontend',
  'devops',
  'intern',
]);

const DEFAULT_PROJECT_ROLE_KEYS = Object.freeze({
  PROJECT_MANAGER: 'project_manager',
  TECH_LEAD: 'tech_lead',
  ARCHITECT: 'architect',
  SENIOR_DEVELOPER: 'senior_developer',
  DEVELOPER: 'developer',
  JUNIOR: 'junior',
  INTERN: 'intern',
  QA: 'qa',
  TESTER: 'tester',
  REVIEWER: 'reviewer',
  RELEASE_MANAGER: 'release_manager',
  WATCHER: 'watcher',
});

/** Specialty / module keys — gợi ý assignee, không phải Role. */
const DEFAULT_RESPONSIBILITY_KEYS = Object.freeze([
  'backend',
  'frontend',
  'qa',
  'devops',
  'architecture',
  'product',
  'design',
]);

const DEFAULT_RESPONSIBILITY_LABELS = Object.freeze({
  backend: 'Backend',
  frontend: 'Frontend',
  qa: 'QA',
  devops: 'DevOps',
  architecture: 'Architecture',
  product: 'Product',
  design: 'Design',
});

function assertNotHrRoleForPermission(kind) {
  if (kind === ROLE_KIND.HR) {
    const err = new Error('HR Role must not be used for permission or task assignment');
    err.errorCode = 'HR_ROLE_NOT_FOR_PERMISSION';
    throw err;
  }
}

function assertNotResponsibilityForPermission(kind) {
  if (kind === ROLE_KIND.RESPONSIBILITY) {
    const err = new Error('Responsibility must not be used as a permission grant');
    err.errorCode = 'RESPONSIBILITY_NOT_FOR_PERMISSION';
    throw err;
  }
}

module.exports = {
  ROLE_KIND,
  ORGANIZATION_ROLE_KEYS,
  LEGACY_MEMBERSHIP_ALIAS_DEBT,
  DEFAULT_HR_ROLE_KEYS,
  DEFAULT_PROJECT_ROLE_KEYS,
  DEFAULT_RESPONSIBILITY_KEYS,
  DEFAULT_RESPONSIBILITY_LABELS,
  assertNotHrRoleForPermission,
  assertNotResponsibilityForPermission,
};
