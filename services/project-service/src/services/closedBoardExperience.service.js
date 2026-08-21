/**
 * Persist closed-board / closed-project experiences onto UserProfile (best-effort S2S).
 */

const { logger } = require('@enterprise/shared');
const Task = require('../models/Task');
const TaskBoard = require('../models/TaskBoard');
const TaskBoardMember = require('../models/TaskBoardMember');
const ProjectMembership = require('../models/ProjectMembership');
const ProjectRole = require('../models/ProjectRole');
const Project = require('../models/Project');
const { buildClosedBoardExperiences } = require('../utils/boardCloseExperience');
const { appendClosedBoardExperience } = require('../clients/userService.client');

const LEGACY_BOARD_ROLES = Object.freeze([
  { _id: 'legacy_owner', key: 'project_manager', label: 'project_manager' },
  { _id: 'legacy_editor', key: 'contributor', label: 'contributor' },
  { _id: 'legacy_viewer', key: 'watcher', label: 'watcher' },
]);

const LEGACY_ROLE_ID_BY_BOARD_ROLE = Object.freeze({
  owner: 'legacy_owner',
  editor: 'legacy_editor',
  viewer: 'legacy_viewer',
});

async function appendExperiencesBestEffort(rows) {
  let appended = 0;
  for (const row of rows || []) {
    const userId = String(row?.userId || '').trim();
    if (!userId) continue;
    try {
      await appendClosedBoardExperience(userId, row);
      appended += 1;
    } catch (err) {
      logger.warn(
        '[closed-board] append failed userId=%s: %s',
        userId,
        err?.message || err
      );
    }
  }
  return appended;
}

/**
 * After project complete — DA suggested experiences for each member.
 * @param {{ project: object, closedAt?: Date, deps?: object }} input
 */
async function persistClosedProjectExperiences({ project, closedAt, deps = {} } = {}) {
  const projectId = String(project?._id || project?.id || '').trim();
  if (!projectId) return { appended: 0, skipped: true, reason: 'no_project' };

  const Membership = deps.ProjectMembership || ProjectMembership;
  const Role = deps.ProjectRole || ProjectRole;
  const TaskModel = deps.Task || Task;
  const Board = deps.TaskBoard || TaskBoard;
  const appendFn = deps.appendClosedBoardExperience || appendClosedBoardExperience;

  const [memberships, board] = await Promise.all([
    Membership.find({ projectId }).select('userId projectRoleId').lean(),
    Board.findOne({ projectId }).select('_id title').sort({ createdAt: 1 }).lean(),
  ]);

  if (!memberships?.length) {
    return { appended: 0, skipped: true, reason: 'no_memberships' };
  }

  const roleIds = [
    ...new Set(memberships.map((m) => String(m.projectRoleId || '')).filter(Boolean)),
  ];
  const roles = roleIds.length
    ? await Role.find({ _id: { $in: roleIds } }).select('_id key label').lean()
    : [];

  const tasks = await TaskModel.find({
    projectId,
    isActive: { $ne: false },
  })
    .select('assigneeId assignments status completedAt')
    .lean();

  const evidenceId = String(board?._id || projectId);
  const dueRaw =
    project.expectedEndDate || project.endDate || closedAt || project.closedAt || new Date();
  const boardLike = {
    _id: evidenceId,
    title: String(project.title || board?.title || 'Dự án').trim() || 'Dự án',
    dueDate: dueRaw,
  };

  const rows = buildClosedBoardExperiences({
    board: boardLike,
    memberships,
    roles,
    tasks,
  });

  let appended = 0;
  for (const row of rows) {
    const userId = String(row?.userId || '').trim();
    if (!userId) continue;
    try {
      await appendFn(userId, row);
      appended += 1;
    } catch (err) {
      logger.warn(
        '[closed-board] project append failed projectId=%s userId=%s: %s',
        projectId,
        userId,
        err?.message || err
      );
    }
  }

  return { appended, skipped: false, evidenceBoardId: evidenceId };
}

/**
 * Standalone / legacy board archive path (no projectId).
 * Boards with projectId should complete via completeProject instead.
 */
async function persistClosedBoardExperiences(board, deps = {}) {
  if (!board) return { appended: 0, skipped: true, reason: 'no_board' };

  const projectId = board.projectId ? String(board.projectId) : '';
  if (projectId) {
    const ProjectModel = deps.Project || Project;
    let project = null;
    try {
      project = await ProjectModel.findById(projectId).lean();
    } catch {
      project = null;
    }
    if (project) {
      return persistClosedProjectExperiences({
        project,
        closedAt: new Date(),
        deps,
      });
    }
  }

  const Member = deps.TaskBoardMember || TaskBoardMember;
  const TaskModel = deps.Task || Task;
  const appendFn = deps.appendClosedBoardExperience || appendClosedBoardExperience;

  const boardId = String(board._id || board.id || '').trim();
  if (!boardId) return { appended: 0, skipped: true, reason: 'no_board_id' };

  const members = await Member.find({ boardId }).select('userId role').lean();
  const memberships = (members || []).map((m) => ({
    userId: m.userId,
    projectRoleId: LEGACY_ROLE_ID_BY_BOARD_ROLE[String(m.role || 'viewer')] || 'legacy_viewer',
  }));

  const tasks = await TaskModel.find({
    boardId,
    isActive: { $ne: false },
  })
    .select('assigneeId assignments status completedAt')
    .lean();

  const rows = buildClosedBoardExperiences({
    board,
    memberships,
    roles: LEGACY_BOARD_ROLES,
    tasks,
  });

  let appended = 0;
  for (const row of rows) {
    const userId = String(row?.userId || '').trim();
    if (!userId) continue;
    try {
      await appendFn(userId, row);
      appended += 1;
    } catch (err) {
      logger.warn(
        '[closed-board] board append failed boardId=%s userId=%s: %s',
        boardId,
        userId,
        err?.message || err
      );
    }
  }

  return { appended, skipped: false, evidenceBoardId: boardId };
}

module.exports = {
  persistClosedProjectExperiences,
  persistClosedBoardExperiences,
  appendExperiencesBestEffort,
  LEGACY_BOARD_ROLES,
};
