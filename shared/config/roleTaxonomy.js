/**
 * Org RBAC 3 lớp (+ Project / Membership tách riêng).
 *
 * - Permission: mã hệ thống theo nhóm chức năng (chỉ đọc; không catalog org).
 * - Organizational Role: entity per-org — carrier Permission+Scope (= gói quyền org).
 * - Organizational Position: entity per-org — bind Role; gán User; không grant trực tiếp.
 *
 * Project Role: Delivery / CanAssign — không đồng nhất Org Role.
 * Membership (owner|admin|hr|member): vai trò tài khoản tenant — không phải nguồn masterGrants sau cutover.
 */

const ROLE_KIND = Object.freeze({
  HR: 'hr_role',
  ORGANIZATION: 'organization_role',
  PROJECT: 'project_role',
  SYSTEM: 'system_membership',
});

const {
  MASTER_POSITION_KEYS,
  MASTER_PROJECT_ROLE_KEYS,
  MASTER_ORGANIZATION_ROLE_KEYS,
  LEGACY_PROJECT_ROLE_KEY_ALIASES,
  LEGACY_HR_POSITION_KEY_ALIASES,
  LEGACY_ORGANIZATION_ROLE_KEY_ALIASES,
  resolveCanonicalProjectRoleKey,
  resolveCanonicalPositionKey,
  resolveCanonicalOrganizationRoleKey,
} = require('./masterData');

/** @deprecated Prefer MASTER_POSITION_KEYS — kept for backward compat */
const DEFAULT_HR_ROLE_KEYS = Object.freeze([...MASTER_POSITION_KEYS]);

/** Canonical master keys + legacy aliases for code still referencing old constants */
const DEFAULT_PROJECT_ROLE_KEYS = Object.freeze({
  PROJECT_MANAGER: 'project_manager',
  PRODUCT_OWNER: 'product_owner',
  SCRUM_MASTER: 'scrum_master',
  SPONSOR: 'sponsor',
  STAKEHOLDER: 'stakeholder',
  SOLUTION_ARCHITECT: 'solution_architect',
  TECHNICAL_LEAD: 'technical_lead',
  BUSINESS_ANALYST: 'business_analyst',
  BACKEND_DEVELOPER: 'backend_developer',
  FRONTEND_DEVELOPER: 'frontend_developer',
  MOBILE_DEVELOPER: 'mobile_developer',
  FULLSTACK_DEVELOPER: 'fullstack_developer',
  QA_LEAD: 'qa_lead',
  QA_ENGINEER: 'qa_engineer',
  UI_UX_DESIGNER: 'ui_ux_designer',
  DEVOPS_ENGINEER: 'devops_engineer',
  OBSERVER: 'observer',
  /** @deprecated use TECHNICAL_LEAD */
  TECH_LEAD: 'tech_lead',
  /** @deprecated use SOLUTION_ARCHITECT */
  ARCHITECT: 'architect',
  /** @deprecated use FULLSTACK_DEVELOPER */
  SENIOR_DEVELOPER: 'senior_developer',
  /** @deprecated use BACKEND_DEVELOPER */
  DEVELOPER: 'developer',
  /** @deprecated use BACKEND_DEVELOPER */
  JUNIOR: 'junior',
  /** @deprecated use OBSERVER */
  INTERN: 'intern',
  /** @deprecated use QA_ENGINEER */
  QA: 'qa',
  /** @deprecated use QA_ENGINEER */
  TESTER: 'tester',
  /** @deprecated use OBSERVER */
  REVIEWER: 'reviewer',
  /** @deprecated use DEVOPS_ENGINEER */
  RELEASE_MANAGER: 'release_manager',
  /** @deprecated use OBSERVER */
  WATCHER: 'observer',
});

/** Expand ORGANIZATION_ROLE_KEYS from master catalog */
const ORGANIZATION_ROLE_KEYS = Object.freeze({
  DEPARTMENT_MANAGER: 'department_manager',
  TEAM_LEAD: 'team_lead',
  DIRECTOR: 'director',
  RESOURCE_MANAGER: 'resource_manager',
  AUDITOR: 'auditor',
  MENTOR: 'mentor',
  HR_APPROVER: 'hr_approver',
  /** @deprecated use TEAM_LEAD */
  TEAM_MANAGER: 'team_manager',
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
    correctKey: ORGANIZATION_ROLE_KEYS.TEAM_LEAD,
    note: 'Team.leader is Organization Role, not Project Role / assign authority.',
  },
});

function assertNotHrRoleForPermission(kind) {
  if (kind === ROLE_KIND.HR) {
    const err = new Error('HR Role must not be used for permission or task assignment');
    err.errorCode = 'HR_ROLE_NOT_FOR_PERMISSION';
    throw err;
  }
}

module.exports = {
  ROLE_KIND,
  ORGANIZATION_ROLE_KEYS,
  LEGACY_MEMBERSHIP_ALIAS_DEBT,
  DEFAULT_HR_ROLE_KEYS,
  MASTER_POSITION_KEYS,
  MASTER_PROJECT_ROLE_KEYS,
  MASTER_ORGANIZATION_ROLE_KEYS,
  DEFAULT_PROJECT_ROLE_KEYS,
  LEGACY_PROJECT_ROLE_KEY_ALIASES,
  LEGACY_HR_POSITION_KEY_ALIASES,
  LEGACY_ORGANIZATION_ROLE_KEY_ALIASES,
  resolveCanonicalProjectRoleKey,
  resolveCanonicalPositionKey,
  resolveCanonicalOrganizationRoleKey,
  assertNotHrRoleForPermission,
};
