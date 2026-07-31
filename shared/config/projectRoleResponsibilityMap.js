const { DEFAULT_PROJECT_ROLE_KEYS } = require('./roleTaxonomy');

const PROJECT_ROLE_RESPONSIBILITY_MAP = Object.freeze({
  [DEFAULT_PROJECT_ROLE_KEYS.DEVELOPER]: ['backend', 'frontend'],
  [DEFAULT_PROJECT_ROLE_KEYS.SENIOR_DEVELOPER]: ['backend', 'frontend'],
  [DEFAULT_PROJECT_ROLE_KEYS.JUNIOR]: ['backend', 'frontend'],
  [DEFAULT_PROJECT_ROLE_KEYS.TECH_LEAD]: ['backend', 'frontend', 'architecture'],
  [DEFAULT_PROJECT_ROLE_KEYS.ARCHITECT]: ['architecture'],
  [DEFAULT_PROJECT_ROLE_KEYS.QA]: ['qa'],
  [DEFAULT_PROJECT_ROLE_KEYS.TESTER]: ['qa'],
  [DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER]: ['product'],
  [DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER]: ['product'],
  [DEFAULT_PROJECT_ROLE_KEYS.RELEASE_MANAGER]: ['devops'],
  [DEFAULT_PROJECT_ROLE_KEYS.SCRUM_MASTER]: [],
  [DEFAULT_PROJECT_ROLE_KEYS.REVIEWER]: [],
  [DEFAULT_PROJECT_ROLE_KEYS.WATCHER]: [],
  [DEFAULT_PROJECT_ROLE_KEYS.INTERN]: [],
});

function mapProjectRoleToResponsibilities(projectRoleKey) {
  const key = String(projectRoleKey || '').trim().toLowerCase();
  return [...new Set(PROJECT_ROLE_RESPONSIBILITY_MAP[key] || [])];
}

module.exports = {
  PROJECT_ROLE_RESPONSIBILITY_MAP,
  mapProjectRoleToResponsibilities,
};
