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
  DEPARTMENT_MANAGER: 'department_manager',
  TEAM_MANAGER: 'team_manager',
  DIRECTOR: 'director',
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

export const ORGANIZATION_ROLE_LABELS = Object.freeze({
  department_manager: 'Department Manager',
  team_manager: 'Team Manager',
  director: 'Director',
});

export const PROJECT_ROLE_LABELS = Object.freeze({
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
