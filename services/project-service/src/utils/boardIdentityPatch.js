/**
 * Pure helpers — Project Settings PATCH whitelist (không phụ thuộc env/DB).
 */

const BOARD_IDENTITY_PATCH_KEYS = Object.freeze([
  'title',
  'projectCode',
  'description',
  'dueDate',
  'visibility',
  'background',
  'scopeType',
  'scopeId',
  'teamId',
]);

const LEGACY_UNIT_SCOPES = Object.freeze(['team', 'department', 'division']);

/**
 * Resolve project/board scope. New creates use organization; legacy unit scopes still parse for dual-read.
 * @param {{ scopeType?: string, scopeId?: string, teamId?: string, organizationId?: string }} args
 */
function resolveBoardScope({ scopeType, scopeId, teamId, organizationId } = {}) {
  const type = String(scopeType || (teamId ? 'team' : '') || 'organization')
    .trim()
    .toLowerCase();

  if (type === 'organization' || !LEGACY_UNIT_SCOPES.includes(type)) {
    const oid = String(scopeId || organizationId || '').trim();
    return { scopeType: 'organization', scopeId: oid };
  }

  return {
    scopeType: type,
    scopeId: String(scopeId || teamId || '').trim(),
  };
}

/**
 * @returns {{ ok: true, $set: object } | { ok: false, message: string }}
 */
function buildBoardIdentityPatch(raw = {}) {
  const $set = {};
  const body = raw && typeof raw === 'object' ? raw : {};

  if (body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (!title) return { ok: false, message: 'title không được để trống' };
    if (title.length > 180) return { ok: false, message: 'title quá dài' };
    $set.title = title;
  }
  if (body.projectCode !== undefined) {
    $set.projectCode = String(body.projectCode || '').trim().slice(0, 64);
  }
  if (body.description !== undefined) {
    $set.description = String(body.description || '').trim().slice(0, 2000);
  }
  if (body.background !== undefined) {
    $set.background = String(body.background || '').trim().slice(0, 2000);
  }
  if (body.visibility !== undefined) {
    const v = String(body.visibility || '').trim();
    if (v !== 'private' && v !== 'workspace') {
      return { ok: false, message: 'visibility phải là private hoặc workspace' };
    }
    $set.visibility = v;
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === '') {
      $set.dueDate = null;
    } else {
      const parsed = new Date(body.dueDate);
      if (Number.isNaN(parsed.getTime())) return { ok: false, message: 'dueDate không hợp lệ' };
      $set.dueDate = parsed;
    }
  }

  const touchingScope =
    body.scopeType !== undefined || body.scopeId !== undefined || body.teamId !== undefined;
  if (touchingScope) {
    const nextScope = resolveBoardScope({
      scopeType: body.scopeType,
      scopeId: body.scopeId,
      teamId: body.teamId,
      organizationId: body.organizationId,
    });
    if (!nextScope.scopeId) {
      return { ok: false, message: 'scopeId/organizationId là bắt buộc khi đổi scope' };
    }
    $set.scopeType = nextScope.scopeType;
    $set.scopeId = nextScope.scopeId;
    $set.teamId = nextScope.scopeType === 'team' ? nextScope.scopeId : null;
  }

  if (!Object.keys($set).length) {
    return { ok: false, message: 'Không có field hợp lệ để cập nhật' };
  }
  return { ok: true, $set };
}

module.exports = {
  BOARD_IDENTITY_PATCH_KEYS,
  LEGACY_UNIT_SCOPES,
  resolveBoardScope,
  buildBoardIdentityPatch,
};
