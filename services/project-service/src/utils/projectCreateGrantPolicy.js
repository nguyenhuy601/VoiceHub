const PROJECT_CREATE_GRANT = 'project.project.create';

/**
 * Tạo dự án chỉ cần mã quyền từ chuỗi vị trí tổ chức → vai trò tổ chức.
 * Không có dự án cá nhân nên không xét scope SELF/DEPARTMENT/ORGANIZATION/SYSTEM.
 * @param {boolean} hasGrant
 */
function assertProjectCreateGrant(hasGrant) {
  if (hasGrant) return;
  const err = new Error(`Thiếu quyền ${PROJECT_CREATE_GRANT}`);
  err.statusCode = 403;
  err.errorCode = 'MISSING_PROJECT_CREATE_GRANT';
  throw err;
}

module.exports = {
  PROJECT_CREATE_GRANT,
  assertProjectCreateGrant,
};
