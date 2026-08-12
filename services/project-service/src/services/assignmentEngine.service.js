const { isAssignmentEngineEnabled } = require('@enterprise/shared/config/assignmentEngine');
const {
  resolveProjectContext,
  listUserProjectRolesOnProject,
  migrateBoardMembersToProjectRoles,
} = require('./projectTeam.service');
const { hasDelegationEdge } = require('./delegation.service');
const { decideAssign } = require('./assignmentDecide');

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
 * 1. Actor & target cùng thuộc Project (ProjectMembership theo projectId)
 * 2. Actor có canAssign → allow bất kỳ member trên roster
 * 3. Không canAssign: chỉ allow nếu có cạnh Delegation Graph (đường bổ sung)
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

  let projectId;
  try {
    const ctx = await resolveProjectContext(bid);
    projectId = ctx.projectId;
  } catch (err) {
    return { ok: false, message: err.message || 'Board không tồn tại' };
  }

  let actorRoles = await listUserProjectRolesOnProject(projectId, actor);
  let targetRoles = await listUserProjectRolesOnProject(projectId, target);

  if (!actorRoles.length || !targetRoles.length) {
    await migrateBoardMembersToProjectRoles(bid, actor);
    actorRoles = await listUserProjectRolesOnProject(projectId, actor);
    targetRoles = await listUserProjectRolesOnProject(projectId, target);
  }

  const actorCanAssign = actorRoles.some((r) => r.canAssign);
  if (!actorRoles.length || !targetRoles.length) {
    return decideAssign({ actorRoles, targetRoles, actorCanAssign, edgeCount: 0, hasEdge: false });
  }

  if (!ASSIGN_SLOTS_REQUIRING_DELEGATION.has(slotKey) && slotKey !== 'primary') {
    return { ok: true, reason: 'slot_optional' };
  }

  if (actorCanAssign) {
    return decideAssign({
      actorRoles,
      targetRoles,
      actorCanAssign: true,
      edgeCount: 1,
      hasEdge: false,
    });
  }

  const hasEdge = await hasDelegationEdge({
    boardId: bid,
    fromRoleIds: actorRoles.map((r) => r._id),
    toRoleIds: targetRoles.map((r) => r._id),
    taskType,
  });

  return decideAssign({
    actorRoles,
    targetRoles,
    actorCanAssign: false,
    hasEdge,
  });
}

module.exports = {
  decideAssign,
  assertCanAssign,
  isAssignmentEngineEnabled,
  ASSIGN_SLOTS_REQUIRING_DELEGATION,
};
