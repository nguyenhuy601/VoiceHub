/**
 * Pure governance access helpers (Phase 6) — no HTTP deps.
 */

const { resolveCanonicalOrganizationRoleKey } = require('@enterprise/shared/config/masterData');

const GOVERNANCE_VIEW_ORG_ROLES = Object.freeze(['director', 'auditor']);

function membershipIsOrgAdmin(membershipRole) {
  const r = String(membershipRole || '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

function hasDirectorOrAuditorRole(organizationRoleKeys = []) {
  const set = new Set(
    (organizationRoleKeys || []).map((k) => resolveCanonicalOrganizationRoleKey(k)).filter(Boolean)
  );
  return GOVERNANCE_VIEW_ORG_ROLES.some((k) => set.has(k));
}

/** Pure helper — list projects filter hides archive by default */
function buildActiveProjectsFilter(organizationId, { includeArchived = false } = {}) {
  const q = { organizationId };
  if (!includeArchived) q.isActive = true;
  return q;
}

module.exports = {
  GOVERNANCE_VIEW_ORG_ROLES,
  membershipIsOrgAdmin,
  hasDirectorOrAuditorRole,
  buildActiveProjectsFilter,
};
