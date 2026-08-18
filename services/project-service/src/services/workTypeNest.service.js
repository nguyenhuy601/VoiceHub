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

/**
 * Nest theo Work types config: đúng 1 cấp, hoặc task→subtask dưới Story/Bug/Feature.
 * @param {string} childType
 * @param {string} parentType
 * @param {object} cfg
 */
function assertChildUnderParentType(childType, parentType, cfg) {
  const check = assertNestByDepth(childType, parentType, cfg);
  if (check.ok) return;
  if (String(childType || '') === 'task' && String(parentType || '') !== 'task') {
    const asSub = assertNestByDepth('subtask', parentType, cfg);
    if (asSub.ok) return;
  }
  throw nestDenied(check.message);
}

async function assertTaskParentNest({ projectId, childCard, parentCard }) {
  if (!parentCard) return;
  const cfg = await loadWorkTypeConfigForProject(projectId);
  const childType = resolveCardWorkType(childCard, parentCard);
  const parentType = resolveCardWorkType(parentCard, null);
  assertChildUnderParentType(childType, parentType, cfg);
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

/**
 * Feature = PlanningItem type=feature cùng project. Trả về feature lean nếu hợp lệ.
 * @returns {Promise<object>}
 */
async function assertTaskFeatureNest({ projectId, childCard, featureId }) {
  const fid = String(featureId || '').trim();
  if (!fid) {
    const err = new Error('featureId không hợp lệ');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_REQUIRED';
    throw err;
  }
  const PlanningItem = require('../models/PlanningItem');
  const feature = await PlanningItem.findOne({
    _id: fid,
    ...(projectId ? { projectId } : {}),
    type: 'feature',
  }).lean();
  if (!feature) {
    const err = new Error('featureId không hợp lệ');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_INVALID';
    throw err;
  }
  const cfg = await loadWorkTypeConfigForProject(projectId || feature.projectId);
  const childType = resolveCardWorkType(childCard, null);
  assertChildUnderParentType(childType, 'feature', cfg);
  return feature;
}

module.exports = {
  loadWorkTypeConfigForProject,
  resolveCardWorkType,
  assertChildUnderParentType,
  assertTaskParentNest,
  assertTaskEpicNest,
  assertTaskFeatureNest,
  assertPlanningParentNest,
};
