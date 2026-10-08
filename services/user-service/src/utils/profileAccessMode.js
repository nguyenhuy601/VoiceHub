/**
 * Phân nhánh GET/PATCH /users/:userId theo actor — không dùng /admin trong path.
 * Admin shape chỉ khi req.companyAdmin đã gắn (org + companyAdminAuth / attach).
 */

/** Fields stripped from peer (and non-self phone/username) responses. */
const PEER_OMIT_FIELDS = [
  'email',
  'phone',
  'dateOfBirth',
  'bio',
  'location',
  'emailBlindIndex',
  'phoneBlindIndex',
  'encV',
];

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

/**
 * Apply response whitelist by view mode. Peer omits PII; self/admin keep full payload.
 * @param {object|null} payload
 * @param {'admin'|'self'|'peer'} mode
 */
function applyProfileResponseShape(payload, mode) {
  if (!payload || typeof payload !== 'object') return payload;
  if (mode === 'self' || mode === 'admin') return payload;

  const out = { ...payload };
  for (const key of PEER_OMIT_FIELDS) {
    delete out[key];
  }
  return out;
}

module.exports = {
  isSameUser,
  resolveProfileViewMode,
  resolveProfilePatchMode,
  applyProfileResponseShape,
  PEER_OMIT_FIELDS,
};
