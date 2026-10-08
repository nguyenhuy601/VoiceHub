/**
 * Chuẩn hóa dữ liệu → Customer Requirement Raw (authz + orchestrate).
 */

const {
  assertRequirementImportOrCreateProjectScope,
} = require('./requirementAccess.service');
const {
  normalizeCustomerWorkbookToRawBuffer,
} = require('../utils/requirement/normalize/normalizeCustomerWorkbookToRawBuffer');
const {
  PROFILE_NEWAY_TRANG_CHU,
  PROFILE_UNKNOWN,
} = require('../utils/requirement/normalize/detectCustomerWorkbookProfile');

/**
 * @param {{ userId: string, organizationId: string, fileBuffer: Buffer, fileName?: string }} opts
 * @returns {Promise<{ buffer: Buffer, fileName: string, profile: string, counts: object }>}
 */
async function normalizeCustomerWorkbookToRaw({
  userId,
  organizationId,
  fileBuffer,
  fileName,
}) {
  await assertRequirementImportOrCreateProjectScope({ userId, organizationId });
  return normalizeCustomerWorkbookToRawBuffer(fileBuffer, { fileName });
}

module.exports = {
  normalizeCustomerWorkbookToRaw,
  normalizeCustomerWorkbookToRawBuffer,
  PROFILE_NEWAY_TRANG_CHU,
  PROFILE_UNKNOWN,
};
