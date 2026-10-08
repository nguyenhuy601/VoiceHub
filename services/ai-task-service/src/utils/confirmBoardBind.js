const { isObjectIdString } = require('./bindObjectIdParam');

/**
 * Bind boardId/listId/ownerTeamId for postConfirm.
 * - If client omits board+list → personal task path (ok).
 * - If client sends boardId+listId → both must be valid ObjectIds.
 * - ownerTeamId must be ObjectId when provided; prefer draft when body invalid.
 *
 * @param {{ boardId?: unknown, listId?: unknown, ownerTeamId?: unknown }} body
 * @param {Record<string, unknown>} extraction
 * @returns {{ ok: true, boardId?: string, listId?: string, ownerTeamId?: string } | { ok: false, errorCode: string, message: string }}
 */
function resolveConfirmBoardTargets(body, extraction) {
  const draft = extraction?.draft || {};
  const rawBoard = body?.boardId != null ? String(body.boardId).trim() : '';
  const rawList = body?.listId != null ? String(body.listId).trim() : '';

  if (rawBoard || rawList) {
    if (!isObjectIdString(rawBoard) || !isObjectIdString(rawList)) {
      return {
        ok: false,
        errorCode: 'AI_CONFIRM_BOARD_INVALID',
        message: 'boardId và listId phải là ObjectId hợp lệ',
      };
    }
  }

  let ownerTeamId;
  const bodyTeam = body?.ownerTeamId != null ? String(body.ownerTeamId).trim() : '';
  const draftTeam =
    (draft.ownerTeamId && String(draft.ownerTeamId).trim()) ||
    (draft.teamId && String(draft.teamId).trim()) ||
    '';
  if (bodyTeam) {
    if (!isObjectIdString(bodyTeam)) {
      return {
        ok: false,
        errorCode: 'AI_CONFIRM_OWNER_TEAM_INVALID',
        message: 'ownerTeamId không hợp lệ',
      };
    }
    // Prefer body only when it matches draft team when draft has one; else allow org admin path via project-service.
    if (draftTeam && bodyTeam !== draftTeam) {
      return {
        ok: false,
        errorCode: 'AI_CONFIRM_OWNER_TEAM_MISMATCH',
        message: 'ownerTeamId không khớp draft',
      };
    }
    ownerTeamId = bodyTeam;
  } else if (draftTeam && isObjectIdString(draftTeam)) {
    ownerTeamId = draftTeam;
  }

  return {
    ok: true,
    boardId: rawBoard || undefined,
    listId: rawList || undefined,
    ownerTeamId,
  };
}

module.exports = {
  resolveConfirmBoardTargets,
};
