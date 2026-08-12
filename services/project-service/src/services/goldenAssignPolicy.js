/**
 * Chuẩn vàng 2 tầng: PM gắn team (ownerTeamId); TL (ledTeamIds) mới gán NV (assigneeId).
 * Owner/Admin org được gán NV (giám sát).
 */
const { normalizeOwnerTeamId } = require('./ownerTeamId');

function isOrgAdminRole(role) {
  const r = String(role || '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

/**
 * @param {object|null} scope task-workspace-scope
 * @param {string|null|undefined} ownerTeamId team sở hữu thẻ
 * @returns {{ ok: boolean, message?: string }}
 */
function assertCanSetCardAssignee(scope, ownerTeamId) {
  if (isOrgAdminRole(scope?.membershipRole)) {
    return { ok: true };
  }
  const teamId = normalizeOwnerTeamId(ownerTeamId);
  if (!teamId) {
    return {
      ok: false,
      message:
        'Gắn team cho thẻ trước khi gán nhân viên (chuẩn vàng: PM giao theo team, Trưởng team mới gán NV)',
    };
  }
  const led = new Set((scope?.ledTeamIds || []).map(String));
  if (led.has(String(teamId))) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      'Chỉ Trưởng team của team được gán mới được chỉ định nhân viên trên thẻ này (PM chỉ giao theo team)',
  };
}

module.exports = {
  isOrgAdminRole,
  assertCanSetCardAssignee,
};
