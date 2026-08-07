/**
 * Phase 6 — who can view governance reports / audit (read).
 * Org owner|admin OR master Org Role director|auditor.
 */

const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
const { fetchProjectVisibilityContext } = require('../clients/orgVisibility.client');
const {
  GOVERNANCE_VIEW_ORG_ROLES,
  membershipIsOrgAdmin,
  hasDirectorOrAuditorRole,
  buildActiveProjectsFilter,
} = require('../utils/governanceAccess');

/**
 * @returns {{ scope, organizationRoleKeys, isOrgAdmin: boolean, canViewReports: boolean }}
 */
async function resolveGovernanceViewer(organizationId, userId) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  const isOrgAdmin = membershipIsOrgAdmin(scope?.membershipRole);
  let organizationRoleKeys = Array.isArray(scope?.organizationRoleKeys)
    ? scope.organizationRoleKeys
    : [];
  if (!organizationRoleKeys.length) {
    const vis = await fetchProjectVisibilityContext(organizationId, userId);
    organizationRoleKeys = vis.organizationRoleKeys || [];
  }
  const canViewReports = isOrgAdmin || hasDirectorOrAuditorRole(organizationRoleKeys);
  return {
    scope,
    organizationRoleKeys,
    isOrgAdmin,
    canViewReports,
  };
}

async function assertCanViewGovernanceReports(organizationId, userId) {
  const ctx = await resolveGovernanceViewer(organizationId, userId);
  if (!ctx.canViewReports) {
    const err = new Error(
      'Chỉ org admin hoặc Org Role director/auditor được xem báo cáo / audit'
    );
    err.statusCode = 403;
    err.errorCode = 'GOVERNANCE_VIEW_FORBIDDEN';
    throw err;
  }
  return ctx;
}

async function assertOrgAdminOnly(organizationId, userId) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  if (!membershipIsOrgAdmin(scope?.membershipRole)) {
    const err = new Error('Chỉ org admin được thao tác governance settings');
    err.statusCode = 403;
    err.errorCode = 'GOVERNANCE_ADMIN_REQUIRED';
    throw err;
  }
  return scope;
}

module.exports = {
  GOVERNANCE_VIEW_ORG_ROLES,
  membershipIsOrgAdmin,
  hasDirectorOrAuditorRole,
  resolveGovernanceViewer,
  assertCanViewGovernanceReports,
  assertOrgAdminOnly,
  buildActiveProjectsFilter,
};
