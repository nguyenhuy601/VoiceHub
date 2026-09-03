/**
 * Staffing constants for RequirementPack — đồng bộ tay với user-service capabilityCatalog.
 * Không HTTP chéo lúc import Excel.
 */

const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');

/** Skill whitelist — mirror user-service/src/constants/capabilityCatalog.js SKILL_WHITELIST */
const REQUIREMENT_SKILL_WHITELIST = Object.freeze([
  'JavaScript',
  'TypeScript',
  'React',
  'Vue',
  'Node.js',
  'Express',
  'NestJS',
  'Java',
  'Spring',
  'Python',
  'Django',
  'Go',
  'C#',
  '.NET',
  'PHP',
  'Laravel',
  'MongoDB',
  'PostgreSQL',
  'MySQL',
  'Redis',
  'Docker',
  'Kubernetes',
  'CI/CD',
  'Git',
  'REST API',
  'GraphQL',
  'WebSocket',
  'Selenium',
  'Playwright',
  'Jest',
  'Cypress',
  'Manual Testing',
  'API Testing',
  'Figma',
  'Agile/Scrum',
  'Jira',
  'Requirement Analysis',
  'System Design',
  'AWS',
  'Linux',
]);

const REQUIREMENT_SKILL_WHITELIST_LOWER = new Set(
  REQUIREMENT_SKILL_WHITELIST.map((s) => s.toLowerCase())
);

const SUGGESTED_PROJECT_ROLE_KEYS = Object.freeze([
  ...new Set(Object.values(DEFAULT_PROJECT_ROLE_KEYS).map((k) => String(k).trim().toLowerCase())),
]);

const SUGGESTED_PROJECT_ROLE_SET = new Set(SUGGESTED_PROJECT_ROLE_KEYS);

const STAFFING_SOURCE = Object.freeze(['excel', 'rollup', 'ai']);

/** @deprecated prefer requirementFrLevel.isFrExecutionLeaf */
const FR_LEAF_LEVEL = 'Task';

module.exports = {
  REQUIREMENT_SKILL_WHITELIST,
  REQUIREMENT_SKILL_WHITELIST_LOWER,
  SUGGESTED_PROJECT_ROLE_KEYS,
  SUGGESTED_PROJECT_ROLE_SET,
  STAFFING_SOURCE,
  FR_LEAF_LEVEL,
};
