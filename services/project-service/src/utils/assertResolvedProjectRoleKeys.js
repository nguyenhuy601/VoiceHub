/**
 * Guard trước deleteMany ProjectMembership — tránh $nin:[] xóa sạch roles.
 * @param {string[]} keys
 * @param {Array} roles resolved from catalog
 */
function assertResolvedProjectRoleKeys(keys, roles) {
  if (!keys?.length) {
    const err = new Error('Cần ít nhất một project role');
    err.statusCode = 400;
    throw err;
  }
  if (!roles?.length) {
    const err = new Error('Không có project role hợp lệ trong danh sách đã gửi');
    err.statusCode = 400;
    throw err;
  }
}

module.exports = { assertResolvedProjectRoleKeys };
