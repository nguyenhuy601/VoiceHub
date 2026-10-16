const { mongoose } = require('@enterprise/shared/config/mongo');

/**
 * Filter xóa Document theo org — hỗ trợ organizationId lưu ObjectId hoặc string.
 * @returns {object|null} null nếu organizationId không hợp lệ
 */
function buildOrganizationDocumentPurgeFilter(organizationId) {
  const raw = String(organizationId || '').trim();
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) {
    return null;
  }
  const oid = new mongoose.Types.ObjectId(raw);
  return {
    $or: [{ organizationId: oid }, { organizationId: raw }],
  };
}

module.exports = { buildOrganizationDocumentPurgeFilter };
