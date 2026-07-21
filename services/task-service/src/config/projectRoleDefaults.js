const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');

/** Catalog mặc định Project Role + canAssign capability (không thay Delegation Graph). */
const DEFAULT_PROJECT_ROLES = [
  { key: DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER, label: 'Project Manager', canAssign: true, sortOrder: 10 },
  { key: DEFAULT_PROJECT_ROLE_KEYS.TECH_LEAD, label: 'Tech Lead', canAssign: true, sortOrder: 20 },
  { key: DEFAULT_PROJECT_ROLE_KEYS.ARCHITECT, label: 'Architect', canAssign: true, sortOrder: 30 },
  { key: DEFAULT_PROJECT_ROLE_KEYS.SENIOR_DEVELOPER, label: 'Senior Developer', canAssign: true, sortOrder: 40 },
  { key: DEFAULT_PROJECT_ROLE_KEYS.DEVELOPER, label: 'Developer', canAssign: false, sortOrder: 50 },
  { key: DEFAULT_PROJECT_ROLE_KEYS.JUNIOR, label: 'Junior', canAssign: false, sortOrder: 55 },
  { key: DEFAULT_PROJECT_ROLE_KEYS.INTERN, label: 'Intern', canAssign: false, sortOrder: 60 },
  { key: DEFAULT_PROJECT_ROLE_KEYS.QA, label: 'QA', canAssign: true, sortOrder: 70 },
  { key: DEFAULT_PROJECT_ROLE_KEYS.TESTER, label: 'Tester', canAssign: true, sortOrder: 75 },
  { key: DEFAULT_PROJECT_ROLE_KEYS.REVIEWER, label: 'Reviewer', canAssign: false, sortOrder: 80 },
  { key: DEFAULT_PROJECT_ROLE_KEYS.RELEASE_MANAGER, label: 'Release Manager', canAssign: true, sortOrder: 90 },
  { key: DEFAULT_PROJECT_ROLE_KEYS.WATCHER, label: 'Watcher', canAssign: false, sortOrder: 100 },
];

/** Cạnh mẫu: key→key (áp sau khi có ProjectRole docs). */
const DELEGATION_TEMPLATES = {
  product: {
    id: 'product',
    label: 'Product / delivery digraph',
    edges: [
      ['project_manager', 'tech_lead', ['*']],
      ['project_manager', 'architect', ['*']],
      ['project_manager', 'qa', ['*']],
      ['project_manager', 'developer', ['*']],
      ['project_manager', 'senior_developer', ['*']],
      ['project_manager', 'junior', ['*']],
      ['tech_lead', 'senior_developer', ['*']],
      ['tech_lead', 'developer', ['*']],
      ['tech_lead', 'qa', ['*']],
      ['architect', 'senior_developer', ['tech', '*']],
      ['senior_developer', 'developer', ['*']],
      ['senior_developer', 'junior', ['*']],
      ['senior_developer', 'intern', ['*']],
      ['developer', 'junior', ['*']],
      ['developer', 'intern', ['*']],
      ['qa', 'developer', ['bug']],
      ['qa', 'senior_developer', ['bug']],
      ['tester', 'developer', ['bug']],
      ['release_manager', 'developer', ['deploy', '*']],
    ],
  },
  outsourcing: {
    id: 'outsourcing',
    label: 'Outsourcing digraph',
    edges: [
      ['project_manager', 'tech_lead', ['*']],
      ['project_manager', 'qa', ['*']],
      ['tech_lead', 'developer', ['*']],
      ['tech_lead', 'senior_developer', ['*']],
      ['qa', 'developer', ['bug', '*']],
      ['tester', 'developer', ['bug']],
      ['senior_developer', 'intern', ['*']],
    ],
  },
  startup: {
    id: 'startup',
    label: 'Startup flat digraph',
    edges: [
      ['project_manager', 'developer', ['*']],
      ['project_manager', 'qa', ['*']],
      ['tech_lead', 'developer', ['*']],
      ['tech_lead', 'intern', ['*']],
      ['senior_developer', 'intern', ['*']],
      ['qa', 'developer', ['bug', '*']],
    ],
  },
};

module.exports = {
  DEFAULT_PROJECT_ROLES,
  DELEGATION_TEMPLATES,
};
