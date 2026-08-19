const RESTRICTED_REASON_NOT_PROJECT_MEMBER = 'not_project_member';

function restrictedWorkPreviewBody() {
  return { restricted: true, reason: RESTRICTED_REASON_NOT_PROJECT_MEMBER };
}

/**
 * Membership gates Preview. Missing view perm / summary-only uses the same locked copy (no leak).
 */
function shouldRestrictWorkPreview({ isMember, informationLevel, hasViewPermission } = {}) {
  if (!isMember) return true;
  if (String(informationLevel || '') === 'summary') return true;
  if (!hasViewPermission) return true;
  return false;
}

module.exports = {
  RESTRICTED_REASON_NOT_PROJECT_MEMBER,
  restrictedWorkPreviewBody,
  shouldRestrictWorkPreview,
};
