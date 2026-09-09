/**
 * Org membership helpers for Admin Hub import/ops only.
 * Approve is position/project-role based — see requirementProductUser.
 */

function canImportViaOrgRole(role) {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'owner' || normalized === 'admin' || normalized === 'hr';
}

module.exports = {
  canImportViaOrgRole,
};
