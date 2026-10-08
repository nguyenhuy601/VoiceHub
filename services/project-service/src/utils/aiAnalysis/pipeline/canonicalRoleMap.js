/**
 * Role alias → canonical ROLE-* id (in-repo catalog).
 */

const ROLE_ALIAS_TO_CANONICAL = Object.freeze({
  'backend dev': 'ROLE-BACKEND-DEV',
  'backend developer': 'ROLE-BACKEND-DEV',
  'be developer': 'ROLE-BACKEND-DEV',
  'be dev': 'ROLE-BACKEND-DEV',
  'back-end': 'ROLE-BACKEND-DEV',
  'back end': 'ROLE-BACKEND-DEV',
  'back-end developer': 'ROLE-BACKEND-DEV',
  'back end developer': 'ROLE-BACKEND-DEV',
  backend: 'ROLE-BACKEND-DEV',
  'frontend dev': 'ROLE-FRONTEND-DEV',
  'frontend developer': 'ROLE-FRONTEND-DEV',
  'fe developer': 'ROLE-FRONTEND-DEV',
  'fe dev': 'ROLE-FRONTEND-DEV',
  'front-end': 'ROLE-FRONTEND-DEV',
  'front end': 'ROLE-FRONTEND-DEV',
  'front-end developer': 'ROLE-FRONTEND-DEV',
  frontend: 'ROLE-FRONTEND-DEV',
  'full stack': 'ROLE-FULLSTACK',
  fullstack: 'ROLE-FULLSTACK',
  'full-stack': 'ROLE-FULLSTACK',
  'full stack developer': 'ROLE-FULLSTACK',
  'fullstack developer': 'ROLE-FULLSTACK',
  'mobile dev': 'ROLE-MOBILE-DEV',
  'mobile developer': 'ROLE-MOBILE-DEV',
  'react native': 'ROLE-MOBILE-DEV',
  'react native developer': 'ROLE-MOBILE-DEV',
  qa: 'ROLE-QA',
  'qa engineer': 'ROLE-QA',
  tester: 'ROLE-QA',
  'quality assurance': 'ROLE-QA',
  'test engineer': 'ROLE-QA',
  ba: 'ROLE-BA',
  'business analyst': 'ROLE-BA',
  pm: 'ROLE-PM',
  'project manager': 'ROLE-PM',
  'product manager': 'ROLE-PO',
  po: 'ROLE-PO',
  'product owner': 'ROLE-PO',
  'tech lead': 'ROLE-TL',
  'technical lead': 'ROLE-TL',
  tl: 'ROLE-TL',
  devops: 'ROLE-DEVOPS',
  'devops engineer': 'ROLE-DEVOPS',
  sre: 'ROLE-DEVOPS',
  intern: 'ROLE-INTERN',
  developer: 'ROLE-DEV',
  dev: 'ROLE-DEV',
  software: 'ROLE-DEV',
  'software engineer': 'ROLE-DEV',
  'software developer': 'ROLE-DEV',
});

function normalizeAliasKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function canonicalizeRole(raw) {
  const key = normalizeAliasKey(raw);
  if (!key) return { canonicalId: null, raw: '', unmapped: true };
  if (ROLE_ALIAS_TO_CANONICAL[key]) {
    return { canonicalId: ROLE_ALIAS_TO_CANONICAL[key], raw: String(raw).trim(), unmapped: false };
  }
  const upper = String(raw || '').trim().toUpperCase();
  if (/^ROLE-[A-Z0-9-]+$/.test(upper)) {
    return { canonicalId: upper, raw: String(raw).trim(), unmapped: false };
  }
  return { canonicalId: 'ROLE-UNMAPPED', raw: String(raw).trim(), unmapped: true };
}

module.exports = {
  ROLE_ALIAS_TO_CANONICAL,
  normalizeAliasKey,
  canonicalizeRole,
};
