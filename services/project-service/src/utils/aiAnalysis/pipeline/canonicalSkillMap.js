/**
 * Skill alias → canonical SK-* id (aligned with capability whitelist + common SRS aliases).
 */

const SKILL_ALIAS_TO_CANONICAL = Object.freeze({
  javascript: 'SK-001',
  js: 'SK-001',
  typescript: 'SK-002',
  ts: 'SK-002',
  react: 'SK-003',
  'react.js': 'SK-003',
  reactjs: 'SK-003',
  vue: 'SK-004',
  'vue.js': 'SK-004',
  vuejs: 'SK-004',
  'node.js': 'SK-005',
  nodejs: 'SK-005',
  node: 'SK-005',
  express: 'SK-006',
  expressjs: 'SK-006',
  nestjs: 'SK-007',
  nest: 'SK-007',
  'nest.js': 'SK-007',
  java: 'SK-008',
  spring: 'SK-009',
  'spring boot': 'SK-009',
  springboot: 'SK-009',
  python: 'SK-010',
  django: 'SK-011',
  go: 'SK-012',
  golang: 'SK-012',
  'c#': 'SK-013',
  csharp: 'SK-013',
  '.net': 'SK-014',
  dotnet: 'SK-014',
  'dot net': 'SK-014',
  php: 'SK-015',
  laravel: 'SK-016',
  mongodb: 'SK-017',
  mongo: 'SK-017',
  postgresql: 'SK-018',
  postgres: 'SK-018',
  pg: 'SK-018',
  'postgre sql': 'SK-018',
  mysql: 'SK-019',
  redis: 'SK-020',
  docker: 'SK-021',
  kubernetes: 'SK-022',
  k8s: 'SK-022',
  'ci/cd': 'SK-023',
  cicd: 'SK-023',
  'ci cd': 'SK-023',
  git: 'SK-024',
  'rest api': 'SK-025',
  rest: 'SK-025',
  restful: 'SK-025',
  graphql: 'SK-026',
  websocket: 'SK-027',
  websockets: 'SK-027',
  selenium: 'SK-028',
  playwright: 'SK-029',
  jest: 'SK-030',
  cypress: 'SK-031',
  'manual testing': 'SK-032',
  'api testing': 'SK-033',
  figma: 'SK-034',
  'agile/scrum': 'SK-035',
  agile: 'SK-035',
  scrum: 'SK-035',
  jira: 'SK-036',
  'requirement analysis': 'SK-037',
  'requirements analysis': 'SK-037',
  'system design': 'SK-038',
  aws: 'SK-039',
  linux: 'SK-040',
  'react native': 'SK-041',
  reactnative: 'SK-041',
  rn: 'SK-041',
});

function normalizeSkillKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function canonicalizeSkill(raw) {
  const key = normalizeSkillKey(raw);
  if (!key) return { canonicalId: null, raw: '', unmapped: true };
  if (SKILL_ALIAS_TO_CANONICAL[key]) {
    return { canonicalId: SKILL_ALIAS_TO_CANONICAL[key], raw: String(raw).trim(), unmapped: false };
  }
  const upper = String(raw || '').trim().toUpperCase();
  if (/^SK-\d+$/.test(upper)) {
    return { canonicalId: upper, raw: String(raw).trim(), unmapped: false };
  }
  return { canonicalId: 'SK-UNMAPPED', raw: String(raw).trim(), unmapped: true };
}

module.exports = {
  SKILL_ALIAS_TO_CANONICAL,
  normalizeSkillKey,
  canonicalizeSkill,
};
