/**
 * Mirror BE shared/config/roleTaxonomy — 4 lớp vai trò.
 * HR Role không dùng phân quyền.
 */

export const ROLE_KIND = Object.freeze({
  HR: 'hr_role',
  ORGANIZATION: 'organization_role',
  PROJECT: 'project_role',
  SYSTEM: 'system_membership',
});

export const ORGANIZATION_ROLE_KEYS = Object.freeze({
  DEPARTMENT_MANAGER: 'DEPARTMENT_MANAGER',
  TEAM_LEAD: 'TEAM_LEAD',
  /** @deprecated use TEAM_LEAD */
  TEAM_MANAGER: 'TEAM_LEAD',
  DIRECTOR: 'DIRECTOR',
  RESOURCE_MANAGER: 'RESOURCE_MANAGER',
  AUDITOR: 'AUDITOR',
  MENTOR: 'MENTOR',
  HR_APPROVER: 'HR_APPROVER',
  MEMBER: 'MEMBER',
});

export const DEFAULT_PROJECT_ROLE_KEYS = Object.freeze({
  PROJECT_MANAGER: 'project_manager',
  PRODUCT_OWNER: 'product_owner',
  SCRUM_MASTER: 'scrum_master',
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

export const DEFAULT_HR_ROLE_KEYS = Object.freeze([
  'engineering_manager',
  'product_manager',
  'team_lead',
  'business_analyst',
  'software_developer',
  'qa_engineer',
  'ux_designer',
  'devops_engineer',
  'scrum_master',
  'technical_lead',
  'intern',
]);

export const DEFAULT_HR_ROLE_LABELS = Object.freeze({
  engineering_manager: 'Engineering Manager',
  product_manager: 'Product Manager',
  team_lead: 'Team Lead',
  business_analyst: 'Business Analyst',
  software_developer: 'Software Developer',
  qa_engineer: 'QA Engineer',
  ux_designer: 'UX Designer',
  devops_engineer: 'DevOps Engineer',
  scrum_master: 'Scrum Master',
  technical_lead: 'Technical Lead',
  intern: 'Intern',
});

/**
 * VI fallback (không locale). UI admin dùng adminRbac.orgRoleLabel.* qua localizedOrgRoleLabel.
 * UPPER SoT + lowercase aliases for legacy API/DB codes.
 */
export const ORGANIZATION_ROLE_LABELS = Object.freeze({
  DEPARTMENT_MANAGER: 'Trưởng phòng',
  TEAM_LEAD: 'Trưởng nhóm',
  DIRECTOR: 'Giám đốc tổ chức',
  RESOURCE_MANAGER: 'Quản lý nguồn lực',
  HR_APPROVER: 'Nhân sự',
  AUDITOR: 'Kiểm toán',
  MENTOR: 'Người hướng dẫn',
  MEMBER: 'Thành viên',
  ORG_OWNER: 'Chủ sở hữu tổ chức',
  ORG_ADMIN: 'Quản trị viên tổ chức',
  ORG_MEMBER_MANAGER: 'Quản lý thành viên',
  RECRUITMENT_COORDINATOR: 'Điều phối tuyển dụng',
  CAPACITY_PLANNER: 'Lập kế hoạch năng lực',
  WORK_SCHEDULE_APPROVER: 'Phê duyệt lịch làm việc',
  EFFORT_ACTUAL_APPROVER: 'Phê duyệt effort thực tế',
  PMO_MANAGER: 'Quản lý PMO',
  PROJECT_APPROVER: 'Phê duyệt dự án',
  PROJECT_PLAN_REVIEWER: 'Rà soát kế hoạch dự án',
  PROJECT_RESOURCE_APPROVER: 'Phê duyệt nguồn lực dự án',
  PROJECT_AUDITOR: 'Kiểm toán dự án',
  department_manager: 'Trưởng phòng',
  team_manager: 'Trưởng nhóm',
  team_lead: 'Trưởng nhóm',
  director: 'Giám đốc tổ chức',
  resource_manager: 'Quản lý nguồn lực',
  hr_approver: 'Nhân sự',
  auditor: 'Kiểm toán',
  mentor: 'Người hướng dẫn',
  member: 'Thành viên',
  org_member: 'Thành viên',
});

export const PROJECT_ROLE_LABELS = Object.freeze({
  business_analyst: 'Business Analyst',
  project_manager: 'Project Manager',
  product_owner: 'Product Owner',
  scrum_master: 'Scrum Master',
  tech_lead: 'Tech Lead',
  architect: 'Architect',
  senior_developer: 'Senior Developer',
  developer: 'Developer',
  junior: 'Junior',
  intern: 'Intern',
  qa: 'QA',
  tester: 'Tester',
  reviewer: 'Reviewer',
  release_manager: 'Release Manager',
  watcher: 'Watcher',
});

/** Mirror task-service projectRoleDefaults — catalog canAssign (không thay Delegation Graph). */
export const DEFAULT_PROJECT_ROLE_CAN_ASSIGN = Object.freeze({
  project_manager: true,
  product_owner: true,
  scrum_master: true,
  tech_lead: true,
  architect: true,
  senior_developer: true,
  developer: false,
  junior: false,
  intern: false,
  qa: true,
  tester: true,
  reviewer: false,
  release_manager: true,
  watcher: false,
});
