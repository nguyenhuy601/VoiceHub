/**
 * Fast FR → work import for create-from-pack (single auth setup, slim Task/PlanningItem create).
 */

const mongoose = require('../db');
const { logger } = require('@enterprise/shared');
const TaskBoard = require('../models/TaskBoard');
const TaskBoardList = require('../models/TaskBoardList');
const PlanningItem = require('../models/PlanningItem');
const Task = require('../models/Task');
const Project = require('../models/Project');
const TaskBoardMember = require('../models/TaskBoardMember');
const ProjectMembership = require('../models/ProjectMembership');
const TaskActivityLog = require('../models/TaskActivityLog');
const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');
const { assertProjectWritable } = require('../utils/projectCloseGate');
const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
const { resolveUserProjectPermissions } = require('../services/projectAccess.service');
const { ensureProjectMembership } = require('../services/projectTeam.service');
const {
  loadWorkTypeConfigForProject,
  resolveCardWorkType,
  assertChildUnderParentType,
} = require('../services/workTypeNest.service');
const { assertNestByDepth } = require('../utils/workTypeConfig');
const { normalizeIssueType } = require('../utils/projectIssueTypePerms');
const { normalizePlanningStatus, normalizePlanningPriority } = require('../utils/planningItemTypes');
const { syncPrimaryAssignment } = require('../utils/taskAssignments');
const { normalizeEstimateHours: normalizeHoursEstimate } = require('../services/hoursCapacityGuard.service');
const { isFrExecutionLeaf } = require('../utils/requirementFrLevel');
const {
  buildLeafAssigneeMap,
  planningTypeForLevel,
  cardIssueTypeForLevel,
  isCardLevel,
} = require('../utils/requirementPackWorkImport.utils');

const IMPORT_HOURS_RATIONALE = 'requirement_pack_import';
const LARGE_PACK_WARN_ROWS = 200;

function sortFrRows(frList = []) {
  return [...frList].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function frDescription(row) {
  const parts = [];
  const desc = String(row?.description || '').trim();
  const ac = String(row?.acceptanceCriteria || '').trim();
  if (desc) parts.push(desc);
  if (ac) parts.push(`Acceptance: ${ac}`);
  return parts.join('\n\n').slice(0, 4000);
}

function parseOid(raw) {
  const s = String(raw || '').trim();
  if (!s || !mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

async function resolveDefaultTodoList(boardId) {
  let list = await TaskBoardList.findOne({
    boardId,
    isArchived: false,
    isDefault: true,
  }).lean();
  if (!list) {
    list = await TaskBoardList.findOne({
      boardId,
      isArchived: false,
      statusKey: 'todo',
    }).lean();
  }
  if (!list) {
    list = await TaskBoardList.findOne({ boardId, isArchived: false }).sort({ order: 1 }).lean();
  }
  return list;
}

async function legacyCanCreateCards(userId, board) {
  if (String(board.createdBy) === String(userId)) return true;
  const userOid = parseOid(userId);
  if (!userOid) return false;
  const member = await TaskBoardMember.findOne({ boardId: board._id, userId: userOid })
    .select('canEdit role')
    .lean();
  if (member) {
    return Boolean(member.canEdit) || member.role === 'owner' || member.role === 'editor';
  }
  if (board.projectId) {
    const pm = await ProjectMembership.findOne({ projectId: board.projectId, userId: userOid }).lean();
    if (pm) return true;
  }
  return false;
}

async function ensureAssigneeBoardAccessFast({ boardId, assigneeId, actorId }) {
  if (!boardId || !assigneeId) return;
  const assigneeOid = parseOid(assigneeId);
  if (!assigneeOid) return;
  const exists = await TaskBoardMember.findOne({ boardId, userId: assigneeOid }).lean();
  if (!exists) {
    try {
      await TaskBoardMember.create({
        boardId,
        userId: assigneeOid,
        role: 'viewer',
        canView: true,
        canEdit: false,
        addedBy: actorId,
      });
    } catch (err) {
      logger.warn('[requirement] ensure assignee board access failed: %s', err.message);
    }
  }
  try {
    const board = await TaskBoard.findById(boardId).select('projectId').lean();
    const projectId = board?.projectId || null;
    const existingPm = projectId
      ? await ProjectMembership.findOne({ projectId, userId: assigneeOid }).lean()
      : await ProjectMembership.findOne({ boardId, userId: assigneeOid }).lean();
    if (!existingPm) {
      await ensureProjectMembership({
        boardId,
        projectId: projectId || undefined,
        userId: String(assigneeOid),
        projectRoleKey: DEFAULT_PROJECT_ROLE_KEYS.DEVELOPER,
        addedBy: actorId,
      });
    }
  } catch (err) {
    logger.warn('[requirement] ensure assignee project membership failed: %s', err.message);
  }
}

async function logPackImportActivity({
  organizationId,
  projectId,
  boardId,
  actorId,
  title,
  payload,
}) {
  try {
    await TaskActivityLog.create({
      organizationId,
      projectId,
      boardId,
      taskId: null,
      actorId,
      type: 'project.work_imported',
      title: String(title || '').slice(0, 500),
      payload,
    });
  } catch (err) {
    logger.warn('[requirement] import activity log failed: %s', err.message);
  }
}

async function assertBoardCreateAccess({ userId, board }) {
  if (!board || !board.isActive) {
    const err = new Error('Board không hợp lệ');
    err.statusCode = 404;
    throw err;
  }
  if (isProjectRbacV2Enabled() && board.projectId) {
    const resolved = await resolveUserProjectPermissions({
      userId,
      projectId: board.projectId,
      boardId: board._id,
    });
    if (
      !hasPermission(resolved.permissions, 'task:create') &&
      !hasPermission(resolved.permissions, 'story:create') &&
      !hasPermission(resolved.permissions, 'bug:create')
    ) {
      const err = new Error('Không có quyền tạo thẻ');
      err.statusCode = 403;
      throw err;
    }
    const project = await Project.findById(board.projectId).lean();
    if (project) await assertProjectWritable(project);
    return board;
  }
  if (!(await legacyCanCreateCards(userId, board))) {
    const err = new Error('Không có quyền tạo thẻ');
    err.statusCode = 403;
    throw err;
  }
  if (board.projectId) {
    await assertProjectWritable(await Project.findById(board.projectId).lean());
  }
  return board;
}

async function preparePackImportContext({ userId, boardId, listId, projectId }) {
  const board = await TaskBoard.findById(boardId).lean();
  await assertBoardCreateAccess({ userId, board });

  const list =
    listId
      ? await TaskBoardList.findOne({ _id: listId, boardId, isArchived: false }).lean()
      : await resolveDefaultTodoList(boardId);
  if (!list) {
    const err = new Error('Board không có list để tạo thẻ');
    err.statusCode = 422;
    throw err;
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const workTypeCfg = await loadWorkTypeConfigForProject(projectId);
  const lastCard = await Task.findOne({ boardId, isActive: true }).sort({ position: -1 }).lean();
  const planningSortByType = { epic: 0, feature: 0 };
  const assigneeIds = new Set();

  return {
    board,
    list,
    project,
    workTypeCfg,
    planningSortByType,
    nextCardPosition: Number(lastCard?.position) || 0,
    assigneeIds,
  };
}

function nextPlanningSortOrder(ctx, type, explicit) {
  if (explicit !== undefined && explicit !== null && Number.isFinite(Number(explicit))) {
    const n = Number(explicit);
    ctx.planningSortByType[type] = Math.max(ctx.planningSortByType[type] || 0, n);
    return n;
  }
  const next = (Number(ctx.planningSortByType[type]) || 0) + 1000;
  ctx.planningSortByType[type] = next;
  return next;
}

async function createPlanningItemFast(ctx, { userId, type, title, description, parentPlanningMeta, sortOrder }) {
  const itemType = type;
  let parentOid = null;
  if (parentPlanningMeta && itemType === 'feature') {
    parentOid = parentPlanningMeta.id;
    const parentType = String(parentPlanningMeta.planningType || 'epic');
    const check = assertNestByDepth(itemType, parentType, ctx.workTypeCfg);
    if (!check.ok) {
      const err = new Error(check.message || 'Planning nest denied');
      err.statusCode = 400;
      throw err;
    }
  }

  const row = await PlanningItem.create({
    organizationId: ctx.project.organizationId,
    projectId: ctx.project._id,
    type: itemType,
    title: String(title || '').trim().slice(0, 240),
    description: String(description || '').trim().slice(0, 4000),
    parentId: parentOid,
    status: normalizePlanningStatus(),
    priority: normalizePlanningPriority(),
    sortOrder: nextPlanningSortOrder(ctx, itemType, sortOrder),
    createdBy: userId,
  });
  return row.toObject();
}

function assertCardNest(ctx, { issueType, parentTaskMeta, featureId }) {
  const childCard = { issueType: normalizeIssueType(issueType) };
  if (parentTaskMeta) {
    const parentCard = { issueType: parentTaskMeta.issueType || 'task' };
    const childType = resolveCardWorkType(childCard, parentCard);
    const parentType = resolveCardWorkType(parentCard, null);
    assertChildUnderParentType(childType, parentType, ctx.workTypeCfg);
    return;
  }
  if (featureId) {
    const childType = resolveCardWorkType(childCard, null);
    assertChildUnderParentType(childType, 'feature', ctx.workTypeCfg);
  }
}

async function createCardFast(ctx, {
  userId,
  title,
  description,
  issueType,
  parentTaskId,
  epicId,
  featureId,
  estimateHours,
  assigneeId,
  parentTaskMeta,
}) {
  assertCardNest(ctx, {
    issueType,
    parentTaskMeta,
    featureId,
  });

  const nextPos = ctx.nextCardPosition + 1000;
  ctx.nextCardPosition = nextPos;

  const nextEstimateHours =
    estimateHours != null && Number.isFinite(Number(estimateHours))
      ? normalizeHoursEstimate(estimateHours)
      : null;

  const assigneeOid = parseOid(assigneeId);
  const synced = syncPrimaryAssignment(assigneeOid ? String(assigneeOid) : null, []);

  const row = await Task.create({
    boardId: ctx.board._id,
    listId: ctx.list._id,
    projectId: ctx.board.projectId || null,
    parentTaskId: parseOid(parentTaskId),
    organizationId: ctx.board.organizationId,
    teamId: null,
    departmentId: null,
    divisionId: null,
    title: String(title || '').trim(),
    description: String(description || '').trim().slice(0, 12000),
    assigneeId: synced.assigneeId || null,
    assignments: synced.assignments,
    createdBy: userId,
    priority: 'medium',
    estimateHours: nextEstimateHours,
    position: nextPos,
    epicId: parseOid(epicId),
    featureId: parseOid(featureId),
    issueType: normalizeIssueType(issueType),
    aiGenerated: true,
    isActive: true,
    status: 'todo',
  });

  if (synced.assigneeId) {
    ctx.assigneeIds.add(String(synced.assigneeId));
  }

  return row.toObject();
}

/**
 * @param {{
 *   userId: string,
 *   organizationId: string,
 *   pack: object,
 *   project: object,
 *   boardId: string,
 *   listId?: string,
 *   leafAssignments?: Array<{ externalId: string, userId?: string|null }>,
 * }} input
 */
async function importRequirementPackWorkItemsFast(input) {
  const startMs = Date.now();
  const {
    userId,
    pack,
    project,
    boardId,
    listId,
    leafAssignments = [],
  } = input;

  const projectId = String(project?._id || project?.projectId || '').trim();
  const boardIdStr = String(boardId || project?.defaultBoardId || '').trim();
  if (!projectId || !boardIdStr) {
    const err = new Error('projectId và boardId bắt buộc để import work');
    err.statusCode = 400;
    throw err;
  }

  const frList = pack?.functionalRequirements || [];
  if (frList.length > LARGE_PACK_WARN_ROWS) {
    logger.warn(
      '[requirement] import work large pack rows=%d pack=%s',
      frList.length,
      String(pack?._id || '')
    );
  }

  const ctx = await preparePackImportContext({
    userId,
    boardId: boardIdStr,
    listId,
    projectId,
  });

  const overlayLeaves = pack?.aiPlanning?.overlay?.leafAssignments || [];
  const assigneeMap = buildLeafAssigneeMap(leafAssignments, overlayLeaves);

  const idMap = new Map();
  const stats = {
    planningItems: 0,
    cards: 0,
    assigned: 0,
    skipped: 0,
    warnings: [],
    durationMs: 0,
  };

  for (const row of sortFrRows(frList)) {
    const externalId = String(row.externalId || '').trim();
    const level = String(row.level || '').trim();
    const parentExt = String(row.parentExternalId || '').trim();
    const parentRef = parentExt ? idMap.get(parentExt) : null;
    const title = String(row.name || externalId || 'Work item').trim().slice(0, 240);
    const description = frDescription(row);
    const estimateHours =
      row.estimateHours != null && Number.isFinite(Number(row.estimateHours))
        ? Number(row.estimateHours)
        : null;

    try {
      const planningType = planningTypeForLevel(level);
      if (planningType) {
        let parentPlanningMeta = null;
        if (parentRef?.kind === 'planning') {
          parentPlanningMeta = {
            id: parentRef.id,
            planningType: parentRef.planningType || parentRef.level,
          };
        }

        const created = await createPlanningItemFast(ctx, {
          userId,
          type: planningType,
          title,
          description,
          parentPlanningMeta: planningType === 'feature' ? parentPlanningMeta : null,
          sortOrder: row.sortOrder,
        });

        idMap.set(externalId, {
          kind: 'planning',
          id: created._id,
          level,
          planningType,
          epicId: planningType === 'epic' ? created._id : parentRef?.epicId || null,
          featureId: planningType === 'feature' ? created._id : null,
        });
        stats.planningItems += 1;
        continue;
      }

      if (!isCardLevel(level)) {
        stats.skipped += 1;
        continue;
      }

      const issueType = cardIssueTypeForLevel(level);
      let parentTaskId = null;
      let epicId = null;
      let featureId = null;
      let parentTaskMeta = null;

      if (parentRef?.kind === 'task') {
        parentTaskId = parentRef.id;
        epicId = parentRef.epicId || null;
        featureId = parentRef.featureId || null;
        parentTaskMeta = { issueType: parentRef.issueType || 'task' };
      } else if (parentRef?.kind === 'planning') {
        if (parentRef.level === 'Feature' || parentRef.level === 'Capability') {
          featureId = parentRef.id;
          epicId = parentRef.epicId || null;
        } else if (parentRef.level === 'Epic' || parentRef.level === 'Module') {
          epicId = parentRef.id;
        }
      }

      const assigneeId =
        isFrExecutionLeaf(row, frList) && assigneeMap.has(externalId)
          ? assigneeMap.get(externalId)
          : null;

      const card = await createCardFast(ctx, {
        userId,
        title,
        description,
        issueType,
        parentTaskId,
        epicId,
        featureId,
        estimateHours,
        assigneeId,
        parentTaskMeta,
      });

      idMap.set(externalId, {
        kind: 'task',
        id: card._id,
        level,
        issueType: card.issueType,
        epicId: card.epicId || epicId || null,
        featureId: card.featureId || featureId || null,
      });
      stats.cards += 1;
      if (assigneeId) stats.assigned += 1;
    } catch (err) {
      stats.skipped += 1;
      const msg = `FR ${externalId} (${level}): ${err.message}`;
      stats.warnings.push(msg);
      logger.warn('[requirement] import work skip: %s', msg);
    }
  }

  for (const assigneeId of ctx.assigneeIds) {
    await ensureAssigneeBoardAccessFast({
      boardId: ctx.board._id,
      assigneeId,
      actorId: userId,
    });
  }

  stats.durationMs = Date.now() - startMs;
  logger.info(
    '[requirement] import work fast pack=%s planning=%d cards=%d assigned=%d skipped=%d ms=%d',
    String(pack?._id || ''),
    stats.planningItems,
    stats.cards,
    stats.assigned,
    stats.skipped,
    stats.durationMs
  );

  await logPackImportActivity({
    organizationId: ctx.project.organizationId,
    projectId: ctx.project._id,
    boardId: ctx.board._id,
    actorId: userId,
    title: `Import ${stats.cards} work items từ requirement pack`,
    payload: {
      packId: String(pack?._id || ''),
      planningItems: stats.planningItems,
      cards: stats.cards,
      assigned: stats.assigned,
      skipped: stats.skipped,
      durationMs: stats.durationMs,
    },
  });

  return stats;
}

module.exports = {
  IMPORT_HOURS_RATIONALE,
  LARGE_PACK_WARN_ROWS,
  importRequirementPackWorkItemsFast,
  preparePackImportContext,
};
