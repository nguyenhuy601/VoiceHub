/**
 * Mirror BE shared/config/roleTaxonomy — 4 lớp + Responsibility.
 * HR Role / Responsibility không dùng phân quyền.
 */

export const ROLE_KIND = Object.freeze({
  HR: 'hr_role',
  ORGANIZATION: 'organization_role',
  PROJECT: 'project_role',
  SYSTEM: 'system_membership',
  RESPONSIBILITY: 'responsibility',
});

export const ORGANIZATION_ROLE_KEYS = Object.freeze({
  DEPARTMENT_MANAGER: 'department_manager',
  TEAM_MANAGER: 'team_manager',
  DIRECTOR: 'director',
});

export const DEFAULT_PROJECT_ROLE_KEYS = Object.freeze({
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

export const DEFAULT_HR_ROLE_KEYS = Object.freeze([
  'senior_backend',
  'junior',
  'qa',
  'architect',
  'senior_frontend',
  'devops',
  'intern',
]);

export const DEFAULT_HR_ROLE_LABELS = Object.freeze({
  senior_backend: 'Senior Backend',
  junior: 'Junior',
  qa: 'QA',
  architect: 'Architect',
  senior_frontend: 'Senior Frontend',
  devops: 'DevOps',
  intern: 'Intern',
});

export const ORGANIZATION_ROLE_LABELS = Object.freeze({
  department_manager: 'Department Manager',
  team_manager: 'Team Manager',
  director: 'Director',
});

export const PROJECT_ROLE_LABELS = Object.freeze({
  project_manager: 'Project Manager',
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

export const DEFAULT_RESPONSIBILITY_KEYS = Object.freeze([
  'backend',
  'frontend',
  'qa',
  'devops',
  'architecture',
  'product',
  'design',
]);

export const DEFAULT_RESPONSIBILITY_LABELS = Object.freeze({
  backend: 'Backend',
  frontend: 'Frontend',
  qa: 'QA',
  devops: 'DevOps',
  architecture: 'Architecture',
  product: 'Product',
  design: 'Design',
});
