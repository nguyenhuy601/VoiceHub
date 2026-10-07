/**
 * Chính sách vai trò thành viên (pure — không I/O).
 * Tier của người thao tác lấy từ membership thật, không từ grant:
 * - owner: membership owner
 * - admin: membership admin
 * - hr: membership hr
 * - delegate: vào được route nhờ master grant (membership member hoặc không có) — chịu hạn chế như admin.
 */

const TIER_OWNER = 'owner';
const TIER_ADMIN = 'admin';
const TIER_HR = 'hr';
const TIER_DELEGATE = 'delegate';

const ASSIGNABLE_BY_TIER = Object.freeze({
  [TIER_OWNER]: Object.freeze(['member', 'hr', 'admin']),
  [TIER_ADMIN]: Object.freeze(['member', 'hr']),
  [TIER_DELEGATE]: Object.freeze(['member', 'hr']),
  [TIER_HR]: Object.freeze(['member']),
});

const MANAGEABLE_TARGETS_BY_TIER = Object.freeze({
  [TIER_OWNER]: Object.freeze(['owner', 'admin', 'hr', 'member']),
  [TIER_ADMIN]: Object.freeze(['hr', 'member']),
  [TIER_DELEGATE]: Object.freeze(['hr', 'member']),
  [TIER_HR]: Object.freeze(['member']),
});

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'owner' || r === 'admin' || r === 'hr') return r;
  return 'member';
}

function resolveActorTier(membershipRole) {
  const r = String(membershipRole || '').trim().toLowerCase();
  if (r === 'owner') return TIER_OWNER;
  if (r === 'admin') return TIER_ADMIN;
  if (r === 'hr') return TIER_HR;
  return TIER_DELEGATE;
}

function assignableRolesFor(tier) {
  return ASSIGNABLE_BY_TIER[tier] || ASSIGNABLE_BY_TIER[TIER_HR];
}

function canManageTarget(tier, targetRole) {
  const allowed = MANAGEABLE_TARGETS_BY_TIER[tier] || [];
  return allowed.includes(normalizeRole(targetRole));
}

function deny(status, errorCode, message) {
  return { ok: false, status, errorCode, message };
}

function isSameUser(a, b) {
  const x = String(a || '').trim();
  return Boolean(x) && x === String(b || '').trim();
}

function evaluateRoleChange({ actorTier, actorUserId, targetUserId, targetRole, nextRole, activeOwnerCount }) {
  const target = normalizeRole(targetRole);
  const next = normalizeRole(nextRole);
  if (isSameUser(actorUserId, targetUserId)) {
    return deny(403, 'ORG_SELF_MANAGE_FORBIDDEN', 'Không thể tự đổi vai trò của chính mình.');
  }
  if (next === 'owner') {
    return deny(403, 'ORG_OWNER_ASSIGN_FORBIDDEN', 'Không thể gán vai trò chủ sở hữu. Hãy dùng chức năng chuyển quyền sở hữu.');
  }
  if (!canManageTarget(actorTier, target)) {
    return deny(403, 'ORG_TARGET_ROLE_FORBIDDEN', 'Bạn không có quyền thay đổi vai trò của thành viên này.');
  }
  if (!assignableRolesFor(actorTier).includes(next)) {
    return deny(403, 'ORG_ROLE_ASSIGN_FORBIDDEN', 'Bạn không có quyền gán vai trò này.');
  }
  if (target === 'owner' && Number(activeOwnerCount) <= 1) {
    return deny(409, 'ORG_LAST_OWNER', 'Không thể hạ vai trò chủ sở hữu cuối cùng.');
  }
  return { ok: true };
}

function evaluateRemoval({ actorTier, actorUserId, targetUserId, targetRole, activeOwnerCount }) {
  const target = normalizeRole(targetRole);
  if (isSameUser(actorUserId, targetUserId)) {
    return deny(403, 'ORG_SELF_MANAGE_FORBIDDEN', 'Không thể tự xóa chính mình. Hãy dùng chức năng rời tổ chức.');
  }
  if (!canManageTarget(actorTier, target)) {
    return deny(403, 'ORG_TARGET_ROLE_FORBIDDEN', 'Bạn không có quyền xóa thành viên này.');
  }
  if (target === 'owner' && Number(activeOwnerCount) <= 1) {
    return deny(409, 'ORG_LAST_OWNER', 'Không thể xóa chủ sở hữu cuối cùng.');
  }
  return { ok: true };
}

/** Lời mời giữ hành vi cũ: vai trò vượt quyền bị hạ về member (không báo lỗi). */
function clampInviteRole(actorTier, requestedRole) {
  const role = normalizeRole(requestedRole);
  if (role === 'owner') return 'member';
  return assignableRolesFor(actorTier).includes(role) ? role : 'member';
}

function isImportRoleAllowed(actorTier, role) {
  const normalized = normalizeRole(role);
  if (normalized === 'owner') return false;
  return assignableRolesFor(actorTier).includes(normalized);
}

module.exports = {
  TIER_OWNER,
  TIER_ADMIN,
  TIER_HR,
  TIER_DELEGATE,
  resolveActorTier,
  assignableRolesFor,
  canManageTarget,
  evaluateRoleChange,
  evaluateRemoval,
  clampInviteRole,
  isImportRoleAllowed,
};
