const { isAssignmentEngineEnabled } = require('@enterprise/shared/config/assignmentEngine');
const {
  listUserProjectRolesOnBoard,
  migrateBoardMembersToProjectRoles,
} = require('./projectTeam.service');
const { hasDelegationEdge } = require('./delegation.service');
const ProjectMembership = require('../models/ProjectMembership');

const ASSIGN_SLOTS_REQUIRING_DELEGATION = new Set([
  'primary',
  'reviewer',
  'approver',
  'collaborator',
  'qa_owner',
  'devops_owner',
]);

/**
 * Assignment Engine — không đọc HR Role / Organization Role / ledTeamIds.
 *
 * Điều kiện:
 * 1. Actor có capability canAssign trên ít nhất một Project Role (hoặc break-glass system admin)
 * 2. Actor & target cùng thuộc Project (ProjectMembership)
 * 3. Tồn tại cạnh Delegation Graph from(actor roles) → to(target roles) khớp taskType
 */
async function assertCanAssign({
  actorUserId,
  targetUserId,
  boardId,
  taskType = '*',
  slot = 'primary',
  systemMembershipRole = null,
}) {
  const actor = String(actorUserId || '').trim();
  const target = String(targetUserId || '').trim();
  const bid = String(boardId || '').trim();
  if (!actor || !target || !bid) {
    return { ok: false, message: 'Thiếu actor, target hoặc project' };
  }

  const slotKey = String(slot || 'primary').toLowerCase();
  if (slotKey === 'watcher') {
    return { ok: true, reason: 'watcher_no_delegation' };
  }

  const sys = String(systemMembershipRole || '').toLowerCase();
  if (sys === 'owner' || sys === 'admin') {
    return { ok: true, reason: 'system_break_glass', breakGlass: true };
  }

  let actorRoles = await listUserProjectRolesOnBoard(bid, actor);
  let targetRoles = await listUserProjectRolesOnBoard(bid, target);

  if (!actorRoles.length || !targetRoles.length) {
    await migrateBoardMembersToProjectRoles(bid, actor);
    actorRoles = await listUserProjectRolesOnBoard(bid, actor);
    targetRoles = await listUserProjectRolesOnBoard(bid, target);
  }

  const actorOnProject = await ProjectMembership.exists({ boardId: bid, userId: actor });
  const targetOnProject = await ProjectMembership.exists({ boardId: bid, userId: target });
  if (!actorOnProject || !targetOnProject) {
    return {
      ok: false,
      message: 'Người giao và người nhận phải cùng thuộc Project (Project Team)',
    };
  }

  if (!actorRoles.some((r) => r.canAssign)) {
    return {
      ok: false,
      message: 'Project Role hiện tại không có quyền Assign trên project này',
    };
  }

  if (!ASSIGN_SLOTS_REQUIRING_DELEGATION.has(slotKey) && slotKey !== 'primary') {
    return { ok: true, reason: 'slot_optional' };
  }

  const fromIds = actorRoles.map((r) => r._id);
  const toIds = targetRoles.map((r) => r._id);
  const allowed = await hasDelegationEdge({
    boardId: bid,
    fromRoleIds: fromIds,
    toRoleIds: toIds,
    taskType,
  });

  if (!allowed) {
    const fromLabels = actorRoles.map((r) => r.label || r.key).join(', ');
    const toLabels = targetRoles.map((r) => r.label || r.key).join(', ');
    return {
      ok: false,
      message: `Không có CanAssign từ [${fromLabels}] → [${toLabels}] trên Delegation Graph của project`,
    };
  }

  return { ok: true, reason: 'delegation_edge' };
}

module.exports = {
  assertCanAssign,
  isAssignmentEngineEnabled,
  ASSIGN_SLOTS_REQUIRING_DELEGATION,
};
