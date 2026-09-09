/**
 * Pure helpers for requirement pack → work import (no service deps).
 */

const { isFrExecutionLeaf } = require('../utils/requirementFrLevel');

function normalizeLevel(level) {
  return String(level || '').trim();
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

function planningTypeForLevel(level) {
  const l = normalizeLevel(level);
  if (l === 'Epic' || l === 'Module') return 'epic';
  if (l === 'Feature' || l === 'Capability') return 'feature';
  return null;
}

function cardIssueTypeForLevel(level) {
  const l = normalizeLevel(level);
  if (l === 'Story') return 'story';
  if (l === 'Task' || l === 'Requirement' || l === 'Subtask') return 'task';
  return 'task';
}

function isCardLevel(level) {
  const l = normalizeLevel(level);
  return l === 'Story' || l === 'Task' || l === 'Requirement' || l === 'Subtask';
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
};
