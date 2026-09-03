/**
 * Per execution-leaf assignee suggestions (heuristic, no LLM).
 */

const { scoreVerifiedCapability } = require('./capabilityMatch');
const { scoreHistoricalPerformance } = require('./performanceMatch');
const { listFrExecutionLeaves } = require('./requirementFrLevel');

const LEAF_SUGGESTION_TOP = 3;

function normalizeRoleKey(roleKey) {
  return String(roleKey || '')
    .trim()
    .toLowerCase();
}

function clampScore(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function skillsForLeaf(leaf) {
  return [...new Set((leaf?.suggestedSkills || []).map(String).filter(Boolean))];
}

function requirementSkillObjectsForLeaf(pack, externalId) {
  const id = String(externalId || '').trim();
  if (!id) return null;
  const refs = pack?.requirementSkills || [];
  if (!refs.length) return null;
  const matched = refs
    .filter((ref) => String(ref.externalId || '').trim() === id)
    .map((ref) => ({
      skillId: ref.skillId ? String(ref.skillId) : '',
      name: ref.skillNameSnapshot || ref.rawInput || '',
      requiredLevel: ref.requiredLevel ?? null,
    }))
    .filter((ref) => ref.skillId || ref.name);
  return matched.length ? matched : null;
}

function asVerifiedCapability(cap) {
  if (!cap || typeof cap !== 'object') return null;
  return { ...cap, verificationStatus: 'verified' };
}

function rollupFromSlimPerformance(slim) {
  if (!slim || typeof slim !== 'object') return null;
  return {
    confidence: slim.confidence || 'low',
    estimation: { accuracyPct: slim.estimationAccuracyPct },
    quality: { reworkRate: slim.reworkRate, reopenRate: null },
    velocity: { actualHoursPerWeek: slim.actualHoursPerWeek },
  };
}

function capacityBoost(item) {
  const range = item?.capacityRange;
  if (!range || typeof range !== 'object') {
    const avail = Number(item?.availablePct);
    if (!Number.isFinite(avail)) return { boost: 0, reasons: [], availableHours: null };
    if (avail >= 50) return { boost: 12, reasons: ['capacity_snapshot_high'], availableHours: null };
    if (avail >= 25) return { boost: 6, reasons: ['capacity_snapshot_mid'], availableHours: null };
    if (avail > 0) return { boost: 2, reasons: ['capacity_snapshot_low'], availableHours: null };
    return { boost: -5, reasons: ['capacity_snapshot_none'], availableHours: null };
  }
  const availableHours = Number(range.availableHours);
  const reasons = [];
  let boost = 0;
  if (Number.isFinite(availableHours)) {
    if (availableHours >= 80) {
      boost += 15;
      reasons.push('capacity_hours_high');
    } else if (availableHours >= 40) {
      boost += 10;
      reasons.push('capacity_hours_mid');
    } else if (availableHours > 0) {
      boost += 4;
      reasons.push('capacity_hours_low');
    } else {
      boost -= 8;
      reasons.push('capacity_hours_none');
    }
  }
  const peak = Number(range.peakAllocatedPct);
  if (Number.isFinite(peak) && peak >= 100) {
    boost -= 10;
    reasons.push('capacity_peak_over');
  }
  return {
    boost,
    reasons,
    availableHours: Number.isFinite(availableHours) ? availableHours : null,
  };
}

function scorePoolItemForLeaf({ item, leaf, pack, registrySkills }) {
  const roleKey = normalizeRoleKey(leaf?.suggestedRoleKey);
  const requiredSkills = skillsForLeaf(leaf);
  const capability = asVerifiedCapability(item?.capability);
  const requirementSkillObjects = pack
    ? requirementSkillObjectsForLeaf(pack, leaf?.externalId)
    : null;
  const capMatch = scoreVerifiedCapability({
    verifiedCapability: capability,
    projectRoleKey: roleKey,
    requiredSkills,
    registrySkills,
    requirementSkillObjects,
  });
  const perfMatch = scoreHistoricalPerformance(rollupFromSlimPerformance(item?.performance));
  const cap = capacityBoost(item);
  const score = clampScore(40 + capMatch.boost + perfMatch.boost + cap.boost);
  const reasons = [...(capMatch.reasons || []), ...(perfMatch.reasons || []), ...(cap.reasons || [])];
  return {
    userId: String(item.userId || ''),
    displayName: item.displayName || '',
    jobTitle: item.jobTitle || '',
    score,
    reasons,
    availableHours: cap.availableHours ?? null,
    matchedSkills: capMatch.skillMatch?.matched || [],
  };
}

function pickGreedyAssignee(scored, estimateHours, assignedHoursByUser) {
  const hours = Number(estimateHours) > 0 ? Number(estimateHours) : 0;
  for (const cand of scored) {
    const uid = cand.userId;
    if (!uid) continue;
    const avail = cand.availableHours;
    const used = assignedHoursByUser.get(uid) || 0;
    if (hours > 0 && avail != null && used + hours > avail) continue;
    if (hours > 0) assignedHoursByUser.set(uid, used + hours);
    return { suggestedUserId: uid, suggestedScore: cand.score };
  }
  if (!hours && scored.length && scored[0].userId) {
    return { suggestedUserId: scored[0].userId, suggestedScore: scored[0].score };
  }
  return { suggestedUserId: null, suggestedScore: null };
}

/**
 * @param {{
 *   pack: object,
 *   poolItems?: object[],
 *   registrySkills?: object[],
 * }} input
 */
function buildLeafAssignments({ pack, poolItems = [], registrySkills = [] } = {}) {
  const leaves = listFrExecutionLeaves(pack?.functionalRequirements || []);
  const items = Array.isArray(poolItems) ? poolItems : [];
  const assignedHoursByUser = new Map();

  const sortedLeaves = [...leaves].sort((a, b) => {
    const ra = normalizeRoleKey(a.suggestedRoleKey);
    const rb = normalizeRoleKey(b.suggestedRoleKey);
    if (ra !== rb) return ra.localeCompare(rb);
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  const leafAssignments = [];
  for (const leaf of sortedLeaves) {
    const roleKey = normalizeRoleKey(leaf.suggestedRoleKey);
    const scored = items
      .map((item) => scorePoolItemForLeaf({ item, leaf, pack, registrySkills }))
      .filter((s) => s.userId)
      .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));

    const suggestions = scored.slice(0, LEAF_SUGGESTION_TOP);
    const { suggestedUserId, suggestedScore } = pickGreedyAssignee(
      scored,
      leaf.estimateHours,
      assignedHoursByUser
    );

    leafAssignments.push({
      externalId: String(leaf.externalId || '').trim(),
      level: String(leaf.level || '').trim(),
      name: String(leaf.name || '').trim(),
      roleKey,
      estimateHours: leaf.estimateHours ?? null,
      suggestions,
      suggestedUserId,
      suggestedScore,
    });
  }

  return leafAssignments;
}

module.exports = {
  LEAF_SUGGESTION_TOP,
  buildLeafAssignments,
  scorePoolItemForLeaf,
  skillsForLeaf,
};
