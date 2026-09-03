/**
 * Pure rules for soft-deleting RequirementPack — used by service + unit tests.
 * @param {{ status?: string, projectId?: unknown, isActive?: boolean }} pack
 * @returns {{ ok: true } | { ok: false, statusCode: number, errorCode: string, message: string }}
 */
function assertCanSoftDeleteRequirementPack(pack) {
  if (!pack || pack.isActive === false) {
    return {
      ok: false,
      statusCode: 404,
      errorCode: 'REQ_PACK_NOT_FOUND',
      message: 'Requirement pack không tồn tại',
    };
  }
  if (pack.status !== 'approved') {
    return {
      ok: false,
      statusCode: 409,
      errorCode: 'REQ_PACK_DELETE_FORBIDDEN',
      message: 'Chỉ có thể xóa gói requirement ở trạng thái approved',
    };
  }
  if (pack.projectId) {
    return {
      ok: false,
      statusCode: 409,
      errorCode: 'REQ_PACK_ALREADY_LINKED',
      message: 'Gói đã gắn dự án — không thể xóa',
    };
  }
  return { ok: true };
}

module.exports = {
  assertCanSoftDeleteRequirementPack,
};
