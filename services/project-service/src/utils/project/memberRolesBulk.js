/**
 * Pure helpers for PUT …/members/roles (bulk) — unit-testable without DB.
 */

const BULK_MEMBER_ROLES_MAX = 100;
const BULK_MEMBER_ROLES_CONCURRENCY = 5;

/**
 * @param {unknown} userIds
 * @param {{ isValidId?: (id: string) => boolean }} [opts]
 * @returns {string[]}
 */
function normalizeBulkMemberUserIds(userIds, opts = {}) {
  if (!Array.isArray(userIds)) {
    const err = new Error('userIds phải là mảng');
    err.statusCode = 400;
    err.errorCode = 'PROJECT_MEMBER_ROLES_BULK_INVALID';
    throw err;
  }
  const unique = [...new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!unique.length) {
    const err = new Error('userIds không được rỗng');
    err.statusCode = 400;
    err.errorCode = 'PROJECT_MEMBER_ROLES_BULK_EMPTY';
    throw err;
  }
  if (unique.length > BULK_MEMBER_ROLES_MAX) {
    const err = new Error(`userIds tối đa ${BULK_MEMBER_ROLES_MAX}`);
    err.statusCode = 400;
    err.errorCode = 'PROJECT_MEMBER_ROLES_BULK_TOO_MANY';
    throw err;
  }
  const isValidId = opts.isValidId || (() => true);
  for (const id of unique) {
    if (!isValidId(id)) {
      const err = new Error(`userId không hợp lệ: ${id}`);
      err.statusCode = 400;
      err.errorCode = 'PROJECT_MEMBER_ROLES_BULK_INVALID_ID';
      throw err;
    }
  }
  return unique;
}

/**
 * @param {Array<{ userId: string, ok: boolean, allocationStatus?: string, errorCode?: string }>} results
 */
function aggregateBulkMemberRoleResults(results) {
  let ok = 0;
  let fail = 0;
  let overallocated = 0;
  const slim = [];
  for (const r of results || []) {
    const row = {
      userId: String(r.userId || ''),
      ok: Boolean(r.ok),
    };
    if (r.allocationStatus) row.allocationStatus = r.allocationStatus;
    if (r.errorCode) row.errorCode = r.errorCode;
    slim.push(row);
    if (row.ok) {
      ok += 1;
      if (row.allocationStatus === 'overallocated') overallocated += 1;
    } else {
      fail += 1;
    }
  }
  return { ok, fail, overallocated, results: slim };
}

module.exports = {
  BULK_MEMBER_ROLES_MAX,
  BULK_MEMBER_ROLES_CONCURRENCY,
  normalizeBulkMemberUserIds,
  aggregateBulkMemberRoleResults,
};
