/**
 * Master Organization Role catalog — People Graph SSOT Phase 2.0.
 * Canonical storage keys: UPPER_SNAKE_CASE.
 */

const { ORG_ROLE_LABEL_PREFIX } = require('../../utils/roleLayerNaming');

const MASTER_ORGANIZATION_ROLES = Object.freeze([
  { key: 'DEPARTMENT_MANAGER', label: `${ORG_ROLE_LABEL_PREFIX}Trưởng phòng`, sortOrder: 10 },
  { key: 'TEAM_LEAD', label: `${ORG_ROLE_LABEL_PREFIX}Trưởng nhóm`, sortOrder: 20 },
  { key: 'DIRECTOR', label: `${ORG_ROLE_LABEL_PREFIX}Giám đốc tổ chức`, sortOrder: 30 },
  { key: 'RESOURCE_MANAGER', label: `${ORG_ROLE_LABEL_PREFIX}Quản lý nguồn lực`, sortOrder: 40 },
  { key: 'AUDITOR', label: `${ORG_ROLE_LABEL_PREFIX}Kiểm toán`, sortOrder: 50 },
  { key: 'MENTOR', label: `${ORG_ROLE_LABEL_PREFIX}Người hướng dẫn`, sortOrder: 60 },
  { key: 'HR_APPROVER', label: `${ORG_ROLE_LABEL_PREFIX}Nhân sự`, sortOrder: 70 },
]);

const MASTER_ORGANIZATION_ROLE_KEYS = Object.freeze(
  MASTER_ORGANIZATION_ROLES.map((r) => r.key)
);

/** Baseline member role (not in master enable catalog). */
const MEMBER_ORGANIZATION_ROLE_KEY = 'MEMBER';

/**
 * Legacy / lowercase / alias → canonical UPPER key.
 * Do NOT map ORG_OWNER → DIRECTOR (ownership stays separate).
 */
const LEGACY_ORGANIZATION_ROLE_KEY_ALIASES = Object.freeze({
  department_manager: 'DEPARTMENT_MANAGER',
  team_lead: 'TEAM_LEAD',
  team_manager: 'TEAM_LEAD',
  director: 'DIRECTOR',
  resource_manager: 'RESOURCE_MANAGER',
  auditor: 'AUDITOR',
  mentor: 'MENTOR',
  hr_approver: 'HR_APPROVER',
  member: 'MEMBER',
  org_member: 'MEMBER',
  organization_administrator: 'DIRECTOR',
});

function normalizeOrgRoleKeyLookup(rawKey) {
  return String(rawKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveCanonicalOrganizationRoleKey(rawKey) {
  const raw = String(rawKey || '').trim();
  if (!raw) return '';
  if (MASTER_ORGANIZATION_ROLE_KEYS.includes(raw) || raw === MEMBER_ORGANIZATION_ROLE_KEY) {
    return raw;
  }
  const lower = normalizeOrgRoleKeyLookup(raw);
  if (!lower) return '';
  if (LEGACY_ORGANIZATION_ROLE_KEY_ALIASES[lower]) {
    return LEGACY_ORGANIZATION_ROLE_KEY_ALIASES[lower];
  }
  const asUpper = lower.toUpperCase();
  if (MASTER_ORGANIZATION_ROLE_KEYS.includes(asUpper) || asUpper === MEMBER_ORGANIZATION_ROLE_KEY) {
    return asUpper;
  }
  // Unknown codes (ORG_OWNER, PMO_MANAGER, …): preserve UPPER form of input
  return asUpper;
}

/** All DB codes that may represent a canonical role (for find $in). */
function organizationRoleLookupCodes(canonicalOrRaw) {
  const canonical = resolveCanonicalOrganizationRoleKey(canonicalOrRaw) || String(canonicalOrRaw || '').trim();
  if (!canonical) return [];
  const lower = canonical.toLowerCase();
  const aliases = Object.entries(LEGACY_ORGANIZATION_ROLE_KEY_ALIASES)
    .filter(([, mapped]) => mapped === canonical)
    .map(([legacy]) => legacy);
  return [...new Set([canonical, lower, ...aliases].filter(Boolean))];
}

function getOrganizationRoleByKey(key) {
  const canonical = resolveCanonicalOrganizationRoleKey(key);
  return MASTER_ORGANIZATION_ROLES.find((r) => r.key === canonical) || null;
}

module.exports = {
  MASTER_ORGANIZATION_ROLES,
  MASTER_ORGANIZATION_ROLE_KEYS,
  MEMBER_ORGANIZATION_ROLE_KEY,
  LEGACY_ORGANIZATION_ROLE_KEY_ALIASES,
  normalizeOrgRoleKeyLookup,
  resolveCanonicalOrganizationRoleKey,
  organizationRoleLookupCodes,
  getOrganizationRoleByKey,
};
