/**
 * Project delivery role keys for HOW (WBS / Effort / Matching).
 * Canonicalize via shared master + optional org allow-list (enabledProjectRoleKeys).
 */
const {
  MASTER_PROJECT_ROLE_KEYS,
  resolveCanonicalProjectRoleKey,
} = require('@enterprise/shared/config/roleTaxonomy');

const DEFAULT_FALLBACK_ROLE = 'backend_developer';

function normalizeRoleKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function canonicalizeProjectRoleKey(raw) {
  const normalized = normalizeRoleKey(raw);
  if (!normalized) return '';
  return resolveCanonicalProjectRoleKey(normalized) || normalized;
}

function allowSetFromList(allowList) {
  if (!Array.isArray(allowList) || !allowList.length) return null;
  const set = new Set();
  for (const raw of allowList) {
    const key = canonicalizeProjectRoleKey(raw);
    if (key) set.add(key);
  }
  return set.size ? set : null;
}

/**
 * @param {string} roleKey
 * @param {string[]|null|undefined} [allowList] — org enabledProjectRoleKeys; omit → master catalog
 */
function isKnownProjectRole(roleKey, allowList) {
  const key = canonicalizeProjectRoleKey(roleKey);
  if (!key) return false;
  const allow = allowSetFromList(allowList);
  if (allow) return allow.has(key);
  return MASTER_PROJECT_ROLE_KEYS.includes(key);
}

/**
 * Map AI/heuristic role → canonical key in allow-list (or master).
 * Falls back to area hint / backend_developer within allow-list.
 *
 * @param {string} raw
 * @param {{ allowList?: string[], fallback?: string }} [opts]
 * @returns {string}
 */
function resolveAllowedProjectRoleKey(raw, opts = {}) {
  const allow = allowSetFromList(opts.allowList);
  const preferred = canonicalizeProjectRoleKey(raw);
  if (preferred && (!allow || allow.has(preferred)) && MASTER_PROJECT_ROLE_KEYS.includes(preferred)) {
    return preferred;
  }
  if (preferred && allow && allow.has(preferred)) return preferred;

  const fallback = canonicalizeProjectRoleKey(opts.fallback || DEFAULT_FALLBACK_ROLE);
  if (fallback && (!allow || allow.has(fallback))) return fallback;

  if (allow && allow.size) {
    if (allow.has(DEFAULT_FALLBACK_ROLE)) return DEFAULT_FALLBACK_ROLE;
    return [...allow][0];
  }
  return DEFAULT_FALLBACK_ROLE;
}

/**
 * LLM prompt enum from org allow-list (or delivery-oriented master subset).
 * @param {string[]|null|undefined} allowList
 */
function roleEnumHintFromAllowList(allowList) {
  const allow = allowSetFromList(allowList);
  const preferredOrder = [
    'frontend_developer',
    'backend_developer',
    'qa_engineer',
    'ui_ux_designer',
    'devops_engineer',
    'business_analyst',
    'technical_lead',
    'project_manager',
    'product_owner',
    'fullstack_developer',
    'mobile_developer',
    'qa_lead',
    'solution_architect',
  ];
  const source = allow
    ? preferredOrder.filter((k) => allow.has(k))
    : preferredOrder.filter((k) => MASTER_PROJECT_ROLE_KEYS.includes(k));
  const keys = source.length
    ? source
    : allow
      ? [...allow]
      : [...MASTER_PROJECT_ROLE_KEYS];
  return keys.join('|');
}

module.exports = {
  normalizeRoleKey,
  canonicalizeProjectRoleKey,
  isKnownProjectRole,
  resolveAllowedProjectRoleKey,
  roleEnumHintFromAllowList,
  DEFAULT_FALLBACK_ROLE,
};
