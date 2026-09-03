/**
 * Smart FR leaf selection for LLM staffing prompt.
 */

const { listFrExecutionLeaves } = require('./requirementFrLevel');
const { normalizeRoleKey } = require('./requirementStaffingParse');

function leafMissingStaffing(row) {
  const missing = [];
  if (!(row?.suggestedSkills || []).length) missing.push('skills');
  if (row?.estimateHours == null || Number(row.estimateHours) <= 0) missing.push('hours');
  if (!String(row?.suggestedRoleKey || '').trim()) missing.push('role');
  return missing.length > 0;
}

function leafPriorityScore(row) {
  let score = 0;
  if (leafMissingStaffing(row)) score += 1000;
  const hours = Number(row?.estimateHours);
  if (Number.isFinite(hours) && hours > 0) score += Math.min(hours, 500);
  const sortOrder = Number(row?.sortOrder);
  if (Number.isFinite(sortOrder)) score -= sortOrder * 0.01;
  return score;
}

/**
 * Select leaves for prompt: ensure one leaf per unique roleKey first, then by priority.
 * @param {object[]} frList
 * @param {number} limit
 */
function selectLeavesForPrompt(frList = [], limit = 40) {
  const leaves = listFrExecutionLeaves(frList);
  const totalLeaves = leaves.length;
  if (totalLeaves <= limit) {
    return { leaves, leavesOmittedCount: 0, totalLeaves };
  }

  const byRole = new Map();
  const unassigned = [];

  for (const row of leaves) {
    const roleKey = normalizeRoleKey(row.suggestedRoleKey);
    if (roleKey && !byRole.has(roleKey)) {
      byRole.set(roleKey, row);
    } else {
      unassigned.push(row);
    }
  }

  const selected = [...byRole.values()];
  const selectedIds = new Set(selected.map((r) => String(r.externalId || '')));

  const ranked = unassigned
    .filter((row) => !selectedIds.has(String(row.externalId || '')))
    .sort((a, b) => leafPriorityScore(b) - leafPriorityScore(a));

  for (const row of ranked) {
    if (selected.length >= limit) break;
    const id = String(row.externalId || '');
    if (selectedIds.has(id)) continue;
    selected.push(row);
    selectedIds.add(id);
  }

  selected.sort((a, b) => {
    const scoreDiff = leafPriorityScore(b) - leafPriorityScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
  });

  return {
    leaves: selected.slice(0, limit),
    leavesOmittedCount: Math.max(0, totalLeaves - Math.min(limit, selected.length)),
    totalLeaves,
  };
}

module.exports = {
  leafMissingStaffing,
  leafPriorityScore,
  selectLeavesForPrompt,
};
