/**
 * Technology alias → canonical TECH-* id (MVP).
 */

const TECH_ALIAS_TO_CANONICAL = Object.freeze({
  'react native': 'TECH-034',
  reactnative: 'TECH-034',
  rn: 'TECH-034',
  react: 'TECH-001',
  'react.js': 'TECH-001',
  reactjs: 'TECH-001',
  vue: 'TECH-002',
  'vue.js': 'TECH-002',
  angular: 'TECH-003',
  javascript: 'TECH-010',
  js: 'TECH-010',
  typescript: 'TECH-011',
  ts: 'TECH-011',
  'node.js': 'TECH-020',
  nodejs: 'TECH-020',
  node: 'TECH-020',
  express: 'TECH-021',
  nestjs: 'TECH-022',
  nest: 'TECH-022',
  java: 'TECH-030',
  spring: 'TECH-031',
  'spring boot': 'TECH-031',
  python: 'TECH-040',
  django: 'TECH-041',
  go: 'TECH-050',
  golang: 'TECH-050',
  'c#': 'TECH-060',
  csharp: 'TECH-060',
  '.net': 'TECH-061',
  dotnet: 'TECH-061',
  php: 'TECH-070',
  laravel: 'TECH-071',
  mongodb: 'TECH-080',
  mongo: 'TECH-080',
  postgresql: 'TECH-081',
  postgres: 'TECH-081',
  pg: 'TECH-081',
  mysql: 'TECH-082',
  redis: 'TECH-083',
  docker: 'TECH-090',
  kubernetes: 'TECH-091',
  k8s: 'TECH-091',
  'ci/cd': 'TECH-092',
  cicd: 'TECH-092',
  aws: 'TECH-100',
  graphql: 'TECH-110',
  'rest api': 'TECH-111',
  rest: 'TECH-111',
  websocket: 'TECH-112',
});

function normalizeTechKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function canonicalizeTech(raw) {
  const key = normalizeTechKey(raw);
  if (!key) return { canonicalId: null, raw: '', unmapped: true };
  if (TECH_ALIAS_TO_CANONICAL[key]) {
    return { canonicalId: TECH_ALIAS_TO_CANONICAL[key], raw: String(raw).trim(), unmapped: false };
  }
  const upper = String(raw || '').trim().toUpperCase();
  if (/^TECH-\d+$/.test(upper)) {
    return { canonicalId: upper, raw: String(raw).trim(), unmapped: false };
  }
  return { canonicalId: 'TECH-UNMAPPED', raw: String(raw).trim(), unmapped: true };
}

module.exports = {
  TECH_ALIAS_TO_CANONICAL,
  normalizeTechKey,
  canonicalizeTech,
};
