const { checkMasterGrant } = require('../clients/rbacPermission.client');
const { readStoredSystemAdminState } = require('../clients/storedSystemRole.client');

const STRUCTURE_VIEW_GRANT = 'organization.structure.view';

/**
 * Có master grant `grantKey`. Membership owner/admin/hr không nâng quyền.
 * `allowStoredSystemAdmin` chỉ cho màn bảo trì (bảng nhân sự, đơn vị ngưng), không cho mời/policy.
 */
async function hasElevatedOrgAccess({
  userId,
  orgId,
  grantKey = '',
  allowStoredSystemAdmin = false,
} = {}) {
  const uid = String(userId || '').trim();
  const oid = String(orgId || '').trim();
  if (!uid || !oid) return false;
  if (grantKey && (await checkMasterGrant(uid, oid, grantKey))) return true;
  if (!allowStoredSystemAdmin) return false;
  const stored = await readStoredSystemAdminState(uid);
  return stored.state === 'admin';
}

/** `?includeInactive=1` chỉ khi có structure.view hoặc system admin đã đối chiếu DB. */
async function canIncludeInactiveStructure(req) {
  if (String(req.query?.includeInactive || '') !== '1') return false;
  return hasElevatedOrgAccess({
    userId: req.user?.id || req.user?.userId || req.user?._id,
    orgId: req.params?.orgId,
    grantKey: STRUCTURE_VIEW_GRANT,
    allowStoredSystemAdmin: true,
  });
}

module.exports = {
  hasElevatedOrgAccess,
  canIncludeInactiveStructure,
};
