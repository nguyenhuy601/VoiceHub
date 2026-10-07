const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const MAX_MEMBER_IDS = 500;

function badRequest(errorCode, message) {
  return Object.assign(new Error(message), { statusCode: 400, errorCode });
}

/**
 * Ép id từ body về chuỗi ObjectId (chặn object kiểu `{ "$ne": null }` lọt vào query).
 * Trống → null.
 */
function toPlainId(value) {
  if (value === undefined || value === null || value === '') return null;
  let raw = value;
  if (typeof raw === 'object' && typeof raw.toHexString === 'function') {
    raw = raw.toHexString();
  }
  if (typeof raw !== 'string') {
    throw badRequest('ORG_INVALID_ID', 'Mã định danh không hợp lệ.');
  }
  const id = raw.trim();
  if (!id) return null;
  if (!OBJECT_ID_PATTERN.test(id)) {
    throw badRequest('ORG_INVALID_ID', 'Mã định danh không hợp lệ.');
  }
  return id.toLowerCase();
}

function normalizeMemberIdList(list, { max = MAX_MEMBER_IDS } = {}) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) {
    throw badRequest('ORG_VALIDATION_FAILED', 'Danh sách thành viên không hợp lệ.');
  }
  if (list.length > max) {
    throw badRequest('ORG_BATCH_TOO_LARGE', `Tối đa ${max} thành viên mỗi lần cập nhật.`);
  }
  const ids = [];
  const seen = new Set();
  list.forEach((value) => {
    const id = toPlainId(value);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  });
  return ids;
}

/** Mọi id phải là thành viên active của org (RULE-08). */
async function assertActiveOrgMembers(orgId, ids, { MembershipModel } = {}) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return;
  const Membership = MembershipModel || require('../models/Membership');
  const activeIds = await Membership.distinct('user', {
    organization: orgId,
    user: { $in: unique },
    status: 'active',
  });
  const activeSet = new Set(activeIds.map((id) => String(id).toLowerCase()));
  const missing = unique.filter((id) => !activeSet.has(id.toLowerCase()));
  if (missing.length) {
    throw badRequest('ORG_MEMBER_NOT_IN_ORG', 'Có người dùng không phải thành viên đang hoạt động của tổ chức.');
  }
}

module.exports = {
  MAX_MEMBER_IDS,
  toPlainId,
  normalizeMemberIdList,
  assertActiveOrgMembers,
};
