/**
 * Master Project Role catalog — Delivery Graph SSOT Phase 2.0.
 */

const { PROJECT_ROLE_LABEL_PREFIX } = require('../../utils/roleLayerNaming');

const MASTER_PROJECT_ROLES = Object.freeze([
  { key: 'sponsor', label: `${PROJECT_ROLE_LABEL_PREFIX}Sponsor`, canAssign: false, sortOrder: 5 },
  { key: 'stakeholder', label: `${PROJECT_ROLE_LABEL_PREFIX}Stakeholder`, canAssign: false, sortOrder: 8 },
  { key: 'project_manager', label: `${PROJECT_ROLE_LABEL_PREFIX}Project Manager`, canAssign: true, sortOrder: 10 },
  { key: 'product_owner', label: `${PROJECT_ROLE_LABEL_PREFIX}Product Owner`, canAssign: true, sortOrder: 12 },
  { key: 'scrum_master', label: `${PROJECT_ROLE_LABEL_PREFIX}Scrum Master`, canAssign: true, sortOrder: 14 },
  { key: 'solution_architect', label: `${PROJECT_ROLE_LABEL_PREFIX}Solution Architect`, canAssign: true, sortOrder: 20 },
  { key: 'technical_lead', label: `${PROJECT_ROLE_LABEL_PREFIX}Technical Lead`, canAssign: true, sortOrder: 25 },
  { key: 'business_analyst', label: `${PROJECT_ROLE_LABEL_PREFIX}Business Analyst`, canAssign: true, sortOrder: 28 },
  { key: 'backend_developer', label: `${PROJECT_ROLE_LABEL_PREFIX}Backend Developer`, canAssign: false, sortOrder: 40 },
  { key: 'frontend_developer', label: `${PROJECT_ROLE_LABEL_PREFIX}Frontend Developer`, canAssign: false, sortOrder: 45 },
  { key: 'mobile_developer', label: `${PROJECT_ROLE_LABEL_PREFIX}Mobile Developer`, canAssign: false, sortOrder: 48 },
  { key: 'fullstack_developer', label: `${PROJECT_ROLE_LABEL_PREFIX}Fullstack Developer`, canAssign: false, sortOrder: 50 },
  { key: 'qa_lead', label: `${PROJECT_ROLE_LABEL_PREFIX}QA Lead`, canAssign: true, sortOrder: 60 },
  { key: 'qa_engineer', label: `${PROJECT_ROLE_LABEL_PREFIX}QA Engineer`, canAssign: true, sortOrder: 65 },
  { key: 'ui_ux_designer', label: `${PROJECT_ROLE_LABEL_PREFIX}UI/UX Designer`, canAssign: false, sortOrder: 70 },
  { key: 'devops_engineer', label: `${PROJECT_ROLE_LABEL_PREFIX}DevOps Engineer`, canAssign: true, sortOrder: 75 },
  { key: 'observer', label: `${PROJECT_ROLE_LABEL_PREFIX}Observer`, canAssign: false, sortOrder: 100 },
]);

const MASTER_PROJECT_ROLE_KEYS = Object.freeze(MASTER_PROJECT_ROLES.map((r) => r.key));

/**
 * Legacy project role keys → canonical master key (migration + resolve).
 */
const LEGACY_PROJECT_ROLE_KEY_ALIASES = Object.freeze({
  tech_lead: 'technical_lead',
  architect: 'solution_architect',
  senior_developer: 'fullstack_developer',
  developer: 'backend_developer',
  junior: 'backend_developer',
  intern: 'observer',
  qa: 'qa_engineer',
  tester: 'qa_engineer',
  reviewer: 'observer',
  release_manager: 'devops_engineer',
  watcher: 'observer',
  owner: 'project_manager',
  editor: 'backend_developer',
  viewer: 'observer',
});

function resolveCanonicalProjectRoleKey(rawKey) {
  const k = String(rawKey || '').trim().toLowerCase();
  if (!k) return '';
  if (MASTER_PROJECT_ROLE_KEYS.includes(k)) return k;
  return LEGACY_PROJECT_ROLE_KEY_ALIASES[k] || k;
}

function getProjectRoleByKey(key) {
  const canonical = resolveCanonicalProjectRoleKey(key);
  return MASTER_PROJECT_ROLES.find((r) => r.key === canonical) || null;
}

/** Fallback when migration cannot map a custom key */
const UNMAPPED_PROJECT_ROLE_FALLBACK_KEY = 'observer';

module.exports = {
  MASTER_PROJECT_ROLES,
  MASTER_PROJECT_ROLE_KEYS,
  LEGACY_PROJECT_ROLE_KEY_ALIASES,
  UNMAPPED_PROJECT_ROLE_FALLBACK_KEY,
  resolveCanonicalProjectRoleKey,
  getProjectRoleByKey,
};
