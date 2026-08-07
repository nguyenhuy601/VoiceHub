const {
  orgValidation,
  orgCatch,
} = require('../utils/orgApiError');
const {
  getOrgMasterDataCatalog,
  patchOrgMasterDataEnabled,
  ensureOrgMasterDataSeed,
} = require('../services/orgMasterData.service');
const { isMasterDataV1Enabled } = require('@enterprise/shared/config/masterData');

async function getMasterData(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');
    await ensureOrgMasterDataSeed(organizationId);
    const data = await getOrgMasterDataCatalog(organizationId);
    return res.json({ success: true, data });
  } catch (error) {
    return orgCatch(res, error, error.statusCode || 500);
  }
}

async function patchMasterDataEnabled(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');
    if (!isMasterDataV1Enabled()) {
      return orgCatch(res, new Error('Master Data V1 chưa bật'), 403);
    }
    const {
      companySize,
      enabledDepartmentKeys,
      enabledPositionKeys,
      enabledOrganizationRoleKeys,
      enabledProjectRoleKeys,
    } = req.body || {};
    const actorUserId = req.user?.id || req.userContext?.userId || '';
    const data = await patchOrgMasterDataEnabled(
      organizationId,
      {
        companySize,
        enabledDepartmentKeys,
        enabledPositionKeys,
        enabledOrganizationRoleKeys,
        enabledProjectRoleKeys,
      },
      {
        actorUserId,
        requestId: req.headers['x-request-id'] || '',
      }
    );
    return res.json({ success: true, data });
  } catch (error) {
    return orgCatch(res, error, error.statusCode || 400);
  }
}

module.exports = {
  getMasterData,
  patchMasterDataEnabled,
};
