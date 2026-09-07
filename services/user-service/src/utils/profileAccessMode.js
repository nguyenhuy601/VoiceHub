/**
 * Phân nhánh GET/PATCH /users/:userId theo actor — không dùng /admin trong path.
 * Admin shape chỉ khi req.companyAdmin đã gắn (org + companyAdminAuth / attach).
 */

function isSameUser(actorId, targetUserId) {
  const actor = String(actorId || '').trim();
  const target = String(targetUserId || '').trim();
  return Boolean(actor && target && actor === target);
}

/**
 * @param {{ actorId?: string, targetUserId?: string, companyAdmin?: object|null }} opts
 * @returns {'admin'|'self'|'peer'}
 */
function resolveProfileViewMode({ actorId, targetUserId, companyAdmin } = {}) {
  if (companyAdmin) return 'admin';
  if (isSameUser(actorId, targetUserId)) return 'self';
  return 'peer';
}

/**
 * PATCH người khác = admin. Self không thắng companyAdmin — HR verify chính mình vẫn mode admin.
 * @returns {'admin'|'self'|'forbidden'}
 */
function resolveProfilePatchMode({ actorId, targetUserId, companyAdmin } = {}) {
  if (companyAdmin) return 'admin';
  if (isSameUser(actorId, targetUserId)) return 'self';
  return 'forbidden';
}

module.exports = {
  isSameUser,
  resolveProfileViewMode,
  resolveProfilePatchMode,
};
