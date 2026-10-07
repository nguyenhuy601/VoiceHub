const Membership = require('../models/Membership');
const { checkMasterGrant } = require('../clients/rbacPermission.client');

const STRUCTURE_INACTIVE_ROLES = ['owner', 'admin'];
const STRUCTURE_VIEW_GRANT = 'organization.structure.view';

/** Membership active có role thuộc `roles`, hoặc có master grant `grantKey` trong org. */
async function hasElevatedOrgAccess({ userId, orgId, roles = [], grantKey = '' } = {}) {
  const uid = String(userId || '').trim();
  const oid = String(orgId || '').trim();
  if (!uid || !oid) return false;
  if (roles.length > 0) {
    const membership = await Membership.findOne({ user: uid, organization: oid, status: 'active' })
      .select('role')
      .lean();
    if (membership && roles.includes(Membership.normalizeRole(membership.role))) return true;
  }
  if (!grantKey) return false;
  return checkMasterGrant(uid, oid, grantKey);
}

/** `?includeInactive=1` chỉ có hiệu lực với owner/admin hoặc grant structure.view; còn lại hạ về active-only. */
async function canIncludeInactiveStructure(req) {
  if (String(req.query?.includeInactive || '') !== '1') return false;
  return hasElevatedOrgAccess({
    userId: req.user?.id || req.user?.userId || req.user?._id,
    orgId: req.params?.orgId,
    roles: STRUCTURE_INACTIVE_ROLES,
    grantKey: STRUCTURE_VIEW_GRANT,
  });
}

module.exports = {
  hasElevatedOrgAccess,
  canIncludeInactiveStructure,
};
