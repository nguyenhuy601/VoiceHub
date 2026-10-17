/**
 * Validate org-role assignment keys against catalog rows (key must exist).
 * isSystem catalog rows are assignable; PATCH/DELETE catalog still blocks system rows.
 */
function validateAssignmentRoleKeys(keys, roleByKey) {
  for (const k of keys) {
    const r = roleByKey.get(k);
    if (!r) {
      return { ok: false, code: 'NOT_FOUND', key: k };
    }
  }
  return { ok: true };
}

/**
 * Gán vai trò tổ chức dùng mã OrganizationalRole đang active.
 * Khóa catalog cũ (vd. team_lead) không còn trong danh sách thì bỏ, không báo "không tìm thấy tổ chức".
 * @param {string[]} requestedKeys
 * @param {Iterable<string>} activeCodes
 * @returns {{ assignKeys: string[], droppedKeys: string[], ok: boolean }}
 */
function partitionOrgRoleAssignmentKeys(requestedKeys, activeCodes) {
  const active = new Set(activeCodes);
  const assignKeys = [];
  const droppedKeys = [];
  for (const key of requestedKeys) {
    if (active.has(key)) assignKeys.push(key);
    else droppedKeys.push(key);
  }
  const ok = requestedKeys.length === 0 || assignKeys.length > 0;
  return { assignKeys, droppedKeys, ok };
}

module.exports = {
  validateAssignmentRoleKeys,
  partitionOrgRoleAssignmentKeys,
};
