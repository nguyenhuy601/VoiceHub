/**
 * Pure heuristic_v1 ranking for AI Resource Planning overlay.
 * No DB / HTTP — feed pack + pool items from orchestrator.
 */

const { scoreVerifiedCapability } = require('./capabilityMatch');
const { scoreHistoricalPerformance } = require('./performanceMatch');
const { mapPackConstraintsToProject } = require('./mapPackConstraintsToProject');

const ENGINE = 'heuristic_v1';
const MIN_TOP_N = 5;

function normalizeRoleKey(roleKey) {
  return String(roleKey || '')
    .trim()
    .toLowerCase();
}

function requirementSkillObjectsForRole(pack, roleKey) {
  const refs = pack?.requirementSkills || [];
  if (!refs.length) return null;
  const key = normalizeRoleKey(roleKey);
  const leafIds = new Set(
    (pack?.functionalRequirements || [])
      .filter((row) => normalizeRoleKey(row.suggestedRoleKey) === key)
      .map((row) => String(row.externalId || '').trim())
      .filter(Boolean)
  );
  if (!leafIds.size) return null;
  return refs
    .filter((ref) => leafIds.has(String(ref.externalId || '').trim()))
    .map((ref) => ({
      skillId: ref.skillId ? String(ref.skillId) : '',
      name: ref.skillNameSnapshot || ref.rawInput || '',
      requiredLevel: ref.requiredLevel ?? null,
    }))
    .filter((ref) => ref.skillId || ref.name);
}

function clampScore(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function topNForRole(requiredCount) {
  const n = Math.max(1, Number(requiredCount) || 1);
  return Math.max(n * 3, MIN_TOP_N);
}

function skillNamesFromStaffing(staffing = {}) {
  return (staffing.requiredSkills || [])
    .map((s) => (typeof s === 'string' ? s : s?.name))
    .map((s) => String(s || '').trim())
    .filter(Boolean);
}

function skillsForRole(pack, roleKey) {
  const key = String(roleKey || '')
    .trim()
    .toLowerCase();
  const fromLeaves = (pack?.functionalRequirements || [])
    .filter(
      (row) =>
        String(row.suggestedRoleKey || '')
          .trim()
          .toLowerCase() === key
    )
    .flatMap((row) => row.suggestedSkills || []);
  if (fromLeaves.length) return [...new Set(fromLeaves.map(String))];
  return skillNamesFromStaffing(pack?.staffingPlan);
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
    if (!Number.isFinite(avail)) return { boost: 0, reasons: [] };
    if (avail >= 50) return { boost: 12, reasons: ['capacity_snapshot_high'] };
    if (avail >= 25) return { boost: 6, reasons: ['capacity_snapshot_mid'] };
    if (avail > 0) return { boost: 2, reasons: ['capacity_snapshot_low'] };
    return { boost: -5, reasons: ['capacity_snapshot_none'] };
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
  return { boost, reasons, availableHours: Number.isFinite(availableHours) ? availableHours : null };
}

function scorePoolItemForRole({ item, roleKey, requiredSkills, pack, registrySkills }) {
  const capability = asVerifiedCapability(item?.capability);
  const requirementSkillObjects = pack ? requirementSkillObjectsForRole(pack, roleKey) : null;
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

/**
 * @param {{
 *   pack: object,
 *   poolItems?: object[],
 *   window?: object|null,
 *   staffingOverride?: object|null,
 *   staffingRoles?: object[]|null,
 *   registrySkills?: object[],
 * }} input
 */
function buildHeuristicOverlay({
  pack,
  poolItems = [],
  window = null,
  staffingOverride = null,
  staffingRoles = null,
  registrySkills = [],
} = {}) {
  const packForRank =
    staffingOverride && typeof staffingOverride === 'object' && !staffingRoles?.length
      ? { ...pack, staffingPlan: staffingOverride }
      : pack;
  const staffing = packForRank?.staffingPlan || {};
  const constraints = mapPackConstraintsToProject(packForRank || {});

  let rolesIn;
  let staffingSource;
  let leafCountByRoleMeta = null;

  if (Array.isArray(staffingRoles) && staffingRoles.length) {
    rolesIn = staffingRoles.map((row) => ({
      roleKey: String(row.roleKey || '').trim().toLowerCase(),
      requiredCount: Math.max(1, Number(row.requiredCount) || 1),
    }));
    staffingSource = 'baseline_fte';
    leafCountByRoleMeta = staffingRoles.reduce((acc, row) => {
      const key = String(row.roleKey || '').trim().toLowerCase();
      if (key && row.leafCount != null) acc[key] = Number(row.leafCount) || 0;
      return acc;
    }, {});
  } else {
    rolesIn = Array.isArray(staffing.requiredRoles) ? staffing.requiredRoles : [];
    staffingSource = staffingOverride ? 'proposal' : 'pack';
  }

  const items = Array.isArray(poolItems) ? poolItems : [];

  const roles = [];
  const gaps = [];

  for (const roleRow of rolesIn) {
    const roleKey = String(roleRow.roleKey || '')
      .trim()
      .toLowerCase();
    if (!roleKey) continue;
    const requiredCount = Math.max(1, Number(roleRow.requiredCount) || 1);
    const requiredSkills = skillsForRole(packForRank, roleKey);
    const scored = items
      .map((item) =>
        scorePoolItemForRole({ item, roleKey, requiredSkills, pack: packForRank, registrySkills })
      )
      .filter((s) => s.userId)
      .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));

    const limit = topNForRole(requiredCount);
    const suggestions = scored.slice(0, limit);
    roles.push({
      roleKey,
      requiredCount,
      requiredSkills,
      suggestions,
    });

    if (suggestions.length < requiredCount) {
      gaps.push({
        type: 'role_candidate_shortfall',
        roleKey,
        requiredCount,
        candidateCount: suggestions.length,
      });
    }

    const hoursNeededHint = (packForRank?.functionalRequirements || [])
      .filter(
        (row) =>
          String(row.suggestedRoleKey || '')
            .trim()
            .toLowerCase() === roleKey &&
          row.estimateHours != null &&
          Number(row.estimateHours) > 0
      )
      .reduce((sum, row) => sum + Number(row.estimateHours), 0);
    if (hoursNeededHint > 0) {
      const topHours = suggestions
        .slice(0, requiredCount)
        .reduce((sum, s) => sum + (Number(s.availableHours) || 0), 0);
      if (suggestions.some((s) => s.availableHours != null) && topHours < hoursNeededHint * 0.5) {
        gaps.push({
          type: 'role_capacity_shortfall',
          roleKey,
          hoursNeededHint,
          topAvailableHours: topHours,
        });
      }
    }
  }

  const generatedAt = new Date().toISOString();
  return {
    engine: ENGINE,
    generatedAt,
    window: window
      ? {
          from: window.from || null,
          to: window.to || null,
          source: window.source || null,
          workingDays: window.workingDays ?? null,
        }
      : null,
    roles,
    gaps,
    inputMeta: {
      poolSize: items.length,
      requiredRoleCount: roles.length,
      estimatedHoursTotal: staffing.estimatedHoursTotal ?? null,
      staffingSource,
      leafCountByRole: leafCountByRoleMeta,
      constraints: {
        title: constraints.title,
        startDate: constraints.startDate || null,
        expectedEndDate: constraints.expectedEndDate || null,
        requiredProjectRoles: constraints.requiredProjectRoles,
        budgetStub: constraints.budgetStub,
      },
    },
  };
}

module.exports = {
  ENGINE,
  buildHeuristicOverlay,
  scorePoolItemForRole,
  skillsForRole,
  topNForRole,
};
