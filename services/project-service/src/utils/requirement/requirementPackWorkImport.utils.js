/**
 * Pure helpers for requirement pack → work import (no service deps).
 */

const { isFrExecutionLeaf } = require('./requirementFrLevel');

function normalizeLevel(level) {
  return String(level || '').trim();
}

function levelKey(level) {
  return normalizeLevel(level).toLowerCase();
}

function buildLeafAssigneeMap(leafAssignments = [], overlayLeafAssignments = []) {
  const map = new Map();
  for (const row of overlayLeafAssignments || []) {
    const ext = String(row?.externalId || '').trim();
    if (!ext) continue;
    if (row.suggestedUserId) map.set(ext, String(row.suggestedUserId));
  }
  for (const row of leafAssignments || []) {
    const ext = String(row?.externalId || '').trim();
    if (!ext) continue;
    const uid = row.userId;
    if (uid === null || uid === undefined || uid === '') {
      map.set(ext, null);
    } else {
      map.set(ext, String(uid));
    }
  }
  return map;
}

/** FR Title Case + HOW WBS lowercase (epic/feature/…). */
function planningTypeForLevel(level) {
  const l = levelKey(level);
  if (l === 'epic' || l === 'module') return 'epic';
  if (l === 'feature' || l === 'capability') return 'feature';
  return null;
}

function cardIssueTypeForLevel(level) {
  const l = levelKey(level);
  if (l === 'story') return 'story';
  if (l === 'task' || l === 'requirement' || l === 'subtask') return 'task';
  return 'task';
}

function isCardLevel(level) {
  const l = levelKey(level);
  return l === 'story' || l === 'task' || l === 'requirement' || l === 'subtask';
}

/**
 * Resolve import level for a blueprint row.
 * Known WBS levels pass through; missing level keeps legacy flatten (root→story, child→task).
 */
function resolveBlueprintImportLevel(row = {}) {
  const raw = normalizeLevel(row.level);
  if (planningTypeForLevel(raw) || isCardLevel(raw)) return raw;
  return row.parentBlueprintTaskId ? 'Task' : 'Story';
}

/**
 * Map parent idMap entry → nest links for PlanningItem / Task create.
 * Supports FR (`kind: task`) and legacy blueprint (`kind: card`).
 */
function resolveBlueprintParentLinks(parentRef) {
  let parentTaskId = null;
  let epicId = null;
  let featureId = null;
  let parentTaskMeta = null;
  let parentPlanningMeta = null;

  if (!parentRef) {
    return { parentTaskId, epicId, featureId, parentTaskMeta, parentPlanningMeta };
  }

  if (parentRef.kind === 'planning') {
    parentPlanningMeta = {
      id: parentRef.id,
      planningType: parentRef.planningType || planningTypeForLevel(parentRef.level) || 'epic',
    };
    if (parentRef.planningType === 'feature' || levelKey(parentRef.level) === 'feature' || levelKey(parentRef.level) === 'capability') {
      featureId = parentRef.id;
      epicId = parentRef.epicId || null;
    } else if (
      parentRef.planningType === 'epic' ||
      levelKey(parentRef.level) === 'epic' ||
      levelKey(parentRef.level) === 'module'
    ) {
      epicId = parentRef.id;
    }
  } else if (parentRef.kind === 'task' || parentRef.kind === 'card') {
    parentTaskId = parentRef.id;
    epicId = parentRef.epicId || null;
    featureId = parentRef.featureId || null;
    parentTaskMeta = { issueType: parentRef.issueType || 'task' };
  }

  return { parentTaskId, epicId, featureId, parentTaskMeta, parentPlanningMeta };
}

function listFrRowsWithAssignee(frList = [], assigneeMap = new Map()) {
  return (frList || []).filter((row) => {
    const ext = String(row.externalId || '').trim();
    if (!ext || !isFrExecutionLeaf(row, frList)) return false;
    return assigneeMap.has(ext) && assigneeMap.get(ext);
  });
}

function normalizeCreatePackLeafAssignments(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      externalId: String(row?.externalId || '').trim(),
      userId:
        row?.userId === null || row?.userId === undefined || row?.userId === ''
          ? null
          : String(row.userId),
    }))
    .filter((row) => row.externalId);
}

module.exports = {
  buildLeafAssigneeMap,
  listFrRowsWithAssignee,
  normalizeCreatePackLeafAssignments,
  planningTypeForLevel,
  cardIssueTypeForLevel,
  isCardLevel,
  normalizeLevel,
  levelKey,
  resolveBlueprintImportLevel,
  resolveBlueprintParentLinks,
};
