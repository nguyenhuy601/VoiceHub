const Project = require('../models/Project');
const {
  normalizeWorkTypeConfig,
  assertNestByDepth,
  defaultWorkTypeConfig,
} = require('../utils/workTypeConfig');

function nestDenied(message) {
  const err = new Error(message || 'Chỉ gắn vào nhóm trên đúng 1 cấp theo cấu hình Work types');
  err.statusCode = 400;
  err.errorCode = 'WORK_TYPE_NEST_DENIED';
  return err;
}

async function loadWorkTypeConfigForProject(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return defaultWorkTypeConfig();
  const row = await Project.findById(pid).select('workTypeConfig').lean();
  return normalizeWorkTypeConfig(row?.workTypeConfig);
}

function boardIssueType(doc) {
  const it = String(doc?.issueType || 'task').toLowerCase();
  if (it === 'story' || it === 'bug') return it;
  return 'task';
}

/** Card đứng độc lập: story|bug|task. Task dưới Task → subtask. */
function resolveCardWorkType(card, parentCard) {
  const issue = boardIssueType(card);
  if (!parentCard) return issue;
  const parentIssue = boardIssueType(parentCard);
  if (issue === 'task' && parentIssue === 'task') return 'subtask';
  return issue;
}

async function assertTaskParentNest({ projectId, childCard, parentCard }) {
  if (!parentCard) return;
  const cfg = await loadWorkTypeConfigForProject(projectId);
  const childType = resolveCardWorkType(childCard, parentCard);
  const parentType = resolveCardWorkType(parentCard, null);
  const check = assertNestByDepth(childType, parentType, cfg);
  if (check.ok) return;
  // Default List: Sub-task dưới Story/Bug = issueType task + parentTaskId (không có enum subtask).
  if (childType === 'task' && parentType !== 'task') {
    const asSub = assertNestByDepth('subtask', parentType, cfg);
    if (asSub.ok) return;
  }
  throw nestDenied(check.message);
}

async function assertTaskEpicNest({ projectId, childCard }) {
  const cfg = await loadWorkTypeConfigForProject(projectId);
  const childType = resolveCardWorkType(childCard, null);
  const check = assertNestByDepth(childType, 'epic', cfg);
  if (!check.ok) throw nestDenied(check.message);
}

async function assertPlanningParentNest({ projectId, childType, parentType }) {
  if (!parentType) return;
  const cfg = await loadWorkTypeConfigForProject(projectId);
  const check = assertNestByDepth(childType, parentType, cfg);
  if (!check.ok) throw nestDenied(check.message);
}

module.exports = {
  loadWorkTypeConfigForProject,
  resolveCardWorkType,
  assertTaskParentNest,
  assertTaskEpicNest,
  assertPlanningParentNest,
};
