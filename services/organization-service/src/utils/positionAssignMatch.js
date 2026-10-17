const OBJECT_ID_HEX = /^[a-fA-F0-9]{24}$/;

/**
 * Gán vị trí: nhận id, mã, hoặc tên của OrganizationalPosition đang active.
 * Chức danh hồ sơ cũ không có trong danh sách thì không khớp — không trả 404 "không tìm thấy tổ chức".
 * @param {Array<{ _id?: unknown, code?: string, name?: string }>} positions
 * @param {string} raw
 */
function matchActivePosition(positions, raw) {
  const key = String(raw || '').trim();
  if (!key) return null;
  const rows = Array.isArray(positions) ? positions : [];
  if (OBJECT_ID_HEX.test(key)) {
    const byId = rows.find((row) => String(row?._id || row?.id || '') === key);
    if (byId) return byId;
  }
  const byCode = rows.find((row) => String(row?.code || '') === key);
  if (byCode) return byCode;
  return rows.find((row) => String(row?.name || row?.title || '').trim() === key) || null;
}

module.exports = {
  matchActivePosition,
};
