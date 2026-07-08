const Organization = require('../models/Organization');
const { isSingleOrgMode, isInternalSeedRequest } = require('@enterprise/shared/config/singleCompany');

async function assertCanCreateOrganization(req, res, orgConflict) {
  if (!isSingleOrgMode()) return true;

  if (isInternalSeedRequest(req)) return true;

  const orgCount = await Organization.countDocuments({ isActive: { $ne: false } });
  if (orgCount >= 1) {
    orgConflict(
      res,
      'Chế độ một công ty: không thể tạo thêm tổ chức. Liên hệ IT.',
      'ORG_SINGLE_TENANT'
    );
    return false;
  }
  return true;
}

module.exports = {
  assertCanCreateOrganization,
  isSingleOrgMode,
};
