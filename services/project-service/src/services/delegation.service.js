const DelegationEdge = require('../models/DelegationEdge');
const ProjectRole = require('../models/ProjectRole');
const TaskBoard = require('../models/TaskBoard');
const { DELEGATION_TEMPLATES } = require('../config/projectRoleDefaults');
const { ensureOrgProjectRoles } = require('./projectTeam.service');

function listDelegationTemplates() {
  return Object.values(DELEGATION_TEMPLATES).map((t) => ({
    id: t.id,
    label: t.label,
    edgeCount: t.edges.length,
  }));
}

async function listEdges(boardId) {
  const edges = await DelegationEdge.find({ boardId }).lean();
  const roleIds = [
    ...new Set(edges.flatMap((e) => [String(e.fromRoleId), String(e.toRoleId)])),
  ];
  const roles = await ProjectRole.find({ _id: { $in: roleIds } }).lean();
  const map = new Map(roles.map((r) => [String(r._id), r]));
  return edges.map((e) => ({
    ...e,
    fromRole: map.get(String(e.fromRoleId)) || null,
    toRole: map.get(String(e.toRoleId)) || null,
  }));
}

async function upsertEdge({ boardId, fromRoleId, toRoleId, taskTypes, organizationId }) {
  const types =
    Array.isArray(taskTypes) && taskTypes.length
      ? taskTypes.map((t) => String(t).trim()).filter(Boolean)
      : ['*'];
  return DelegationEdge.findOneAndUpdate(
    { boardId, fromRoleId, toRoleId },
    {
      $set: {
        organizationId,
        boardId,
        fromRoleId,
        toRoleId,
        taskTypes: types,
      },
    },
    { upsert: true, new: true }
  ).lean();
}

async function deleteEdge(boardId, edgeId) {
  return DelegationEdge.deleteOne({ _id: edgeId, boardId });
}

/**
 * Áp template digraph theo key Project Role.
 */
async function applyDelegationTemplate(boardId, templateId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board) throw new Error('Board không tồn tại');
  const template = DELEGATION_TEMPLATES[String(templateId || '').trim()];
  if (!template) throw new Error('Template Delegation không hợp lệ');

  await ensureOrgProjectRoles(board.organizationId);
  const roles = await ProjectRole.find({ organizationId: board.organizationId }).lean();
  const byKey = new Map(roles.map((r) => [r.key, r]));

  let created = 0;
  for (const [fromKey, toKey, taskTypes] of template.edges) {
    const from = byKey.get(fromKey);
    const to = byKey.get(toKey);
    if (!from || !to) continue;
    await upsertEdge({
      boardId: board._id,
      organizationId: board.organizationId,
      fromRoleId: from._id,
      toRoleId: to._id,
      taskTypes: taskTypes || ['*'],
    });
    created += 1;
  }
  return { templateId: template.id, edgesApplied: created };
}

/**
 * Có cạnh from→to khớp taskType không?
 */
function edgeMatchesTaskType(edge, taskType) {
  const types = edge.taskTypes || ['*'];
  if (!types.length || types.includes('*')) return true;
  const tt = String(taskType || '*').trim().toLowerCase() || '*';
  if (tt === '*') return true;
  return types.map((t) => String(t).toLowerCase()).includes(tt);
}

async function hasDelegationEdge({ boardId, fromRoleIds, toRoleIds, taskType }) {
  const from = (fromRoleIds || []).map(String).filter(Boolean);
  const to = (toRoleIds || []).map(String).filter(Boolean);
  if (!from.length || !to.length) return false;

  const edges = await DelegationEdge.find({
    boardId,
    fromRoleId: { $in: from },
    toRoleId: { $in: to },
  }).lean();

  return edges.some((e) => edgeMatchesTaskType(e, taskType));
}

module.exports = {
  listDelegationTemplates,
  listEdges,
  upsertEdge,
  deleteEdge,
  applyDelegationTemplate,
  hasDelegationEdge,
  edgeMatchesTaskType,
};
