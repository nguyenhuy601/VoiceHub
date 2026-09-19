const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');

function normalizeRoleKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

const KNOWN_PROJECT_ROLES = new Set(
  Object.values(DEFAULT_PROJECT_ROLE_KEYS).map((key) => normalizeRoleKey(key))
);

function isKnownProjectRole(roleKey) {
  return KNOWN_PROJECT_ROLES.has(normalizeRoleKey(roleKey));
}

module.exports = { normalizeRoleKey, isKnownProjectRole };
