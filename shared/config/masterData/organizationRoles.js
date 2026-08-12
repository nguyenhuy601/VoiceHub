/**
 * Master Organization Role catalog — People Graph SSOT Phase 2.0.
 */

const { ORG_ROLE_LABEL_PREFIX } = require('../../utils/roleLayerNaming');

const MASTER_ORGANIZATION_ROLES = Object.freeze([
  { key: 'department_manager', label: `${ORG_ROLE_LABEL_PREFIX}Department Manager`, sortOrder: 10 },
  { key: 'team_lead', label: `${ORG_ROLE_LABEL_PREFIX}Team Lead`, sortOrder: 20 },
  { key: 'director', label: `${ORG_ROLE_LABEL_PREFIX}Director`, sortOrder: 30 },
  { key: 'resource_manager', label: `${ORG_ROLE_LABEL_PREFIX}Resource Manager`, sortOrder: 40 },
  { key: 'auditor', label: `${ORG_ROLE_LABEL_PREFIX}Auditor`, sortOrder: 50 },
  { key: 'mentor', label: `${ORG_ROLE_LABEL_PREFIX}Mentor`, sortOrder: 60 },
  { key: 'hr_approver', label: `${ORG_ROLE_LABEL_PREFIX}HR Approver`, sortOrder: 70 },
]);

const MASTER_ORGANIZATION_ROLE_KEYS = Object.freeze(
  MASTER_ORGANIZATION_ROLES.map((r) => r.key)
);

/** Legacy org role keys → canonical master key */
const LEGACY_ORGANIZATION_ROLE_KEY_ALIASES = Object.freeze({
  team_manager: 'team_lead',
  organization_administrator: 'director',
});

function resolveCanonicalOrganizationRoleKey(rawKey) {
  const k = String(rawKey || '').trim().toLowerCase();
  if (!k) return '';
  if (MASTER_ORGANIZATION_ROLE_KEYS.includes(k)) return k;
  return LEGACY_ORGANIZATION_ROLE_KEY_ALIASES[k] || k;
}

function getOrganizationRoleByKey(key) {
  const canonical = resolveCanonicalOrganizationRoleKey(key);
  return MASTER_ORGANIZATION_ROLES.find((r) => r.key === canonical) || null;
}

module.exports = {
  MASTER_ORGANIZATION_ROLES,
  MASTER_ORGANIZATION_ROLE_KEYS,
  LEGACY_ORGANIZATION_ROLE_KEY_ALIASES,
  resolveCanonicalOrganizationRoleKey,
  getOrganizationRoleByKey,
};
