/**
 * Deterministic staffing baseline from RequirementPack FR leaves.
 * FTE counts for AI heuristic — separate from rollup leaf-count semantics.
 */

const { isFrExecutionLeaf } = require('./requirementFrLevel');
const { buildStaffingPlanFromParsed } = require('./requirementStaffingRollup');
const { normalizeRoleKey } = require('./requirementStaffingParse');

const DEFAULT_FTE_CAPACITY_HOURS = 160;
const HOURS_PER_WORKING_DAY = 8;
const FTE_ALLOCATION_FACTOR = 0.8;

function normalizeSkillName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function collectLeafRoleStats(frList = []) {
  const leafCountByRole = {};
  const roleHours = {};
  let totalLeafHours = 0;

  for (const row of frList) {
    if (!isFrExecutionLeaf(row, frList)) continue;
    const roleKey = normalizeRoleKey(row.suggestedRoleKey);
    if (roleKey) {
      leafCountByRole[roleKey] = (leafCountByRole[roleKey] || 0) + 1;
    }
    const hours = Number(row.estimateHours);
    if (Number.isFinite(hours) && hours > 0) {
      totalLeafHours += hours;
      if (roleKey) {
        roleHours[roleKey] = (roleHours[roleKey] || 0) + hours;
      }
    }
  }

  return { leafCountByRole, roleHours, totalLeafHours };
}

function resolveCapacityPerFte(window) {
  const workingDays = Number(window?.workingDays);
  if (Number.isFinite(workingDays) && workingDays > 0) {
    return Math.max(1, Math.round(workingDays * HOURS_PER_WORKING_DAY * FTE_ALLOCATION_FACTOR));
  }
  return DEFAULT_FTE_CAPACITY_HOURS;
}

function deriveFteForRole(roleHours, capacityPerFte, hasLeafWithoutHours) {
  if (roleHours > 0) {
    return Math.max(1, Math.ceil(roleHours / capacityPerFte));
  }
  if (hasLeafWithoutHours) {
    return 1;
  }
  return 1;
}

function buildFteRoles({ leafCountByRole, roleHours, capacityPerFte }) {
  const roleKeys = new Set([
    ...Object.keys(leafCountByRole || {}),
    ...Object.keys(roleHours || {}),
  ]);
  const fteByRole = {};
  const fteRoles = [];

  for (const roleKey of [...roleKeys].sort()) {
    const hours = Number(roleHours[roleKey]) || 0;
    const leafCount = Number(leafCountByRole[roleKey]) || 0;
    const hasLeafWithoutHours = leafCount > 0 && hours <= 0;
    const fte = deriveFteForRole(hours, capacityPerFte, hasLeafWithoutHours);
    fteByRole[roleKey] = fte;
    fteRoles.push({
      roleKey,
      requiredCount: fte,
      leafCount,
      roleHours: hours,
      source: 'baseline_fte',
    });
  }

  return { fteByRole, fteRoles };
}

/**
 * @param {object} pack — RequirementPack plain object
 * @param {{ window?: object|null }} [opts]
 */
function buildStaffingBaselineFromPack(pack, opts = {}) {
  const frList = pack?.functionalRequirements || [];
  const rollup = buildStaffingPlanFromParsed({
    overview: pack?.overview || {},
    functionalRequirements: frList,
  });
  const { leafCountByRole, roleHours, totalLeafHours } = collectLeafRoleStats(frList);
  const capacityPerFte = resolveCapacityPerFte(opts.window);
  const { fteByRole, fteRoles } = buildFteRoles({
    leafCountByRole,
    roleHours,
    capacityPerFte,
  });

  return {
    rollup: {
      requiredSkills: rollup.requiredSkills || [],
      requiredRoles: rollup.requiredRoles || [],
      estimatedHoursTotal: rollup.estimatedHoursTotal ?? null,
    },
    leafCountByRole,
    fteByRole,
    totalLeafHours,
    capacityPerFte,
    fteRoles,
  };
}

function roleKeysFromProposal(proposal) {
  return new Set(
    (proposal?.requiredRoles || [])
      .map((r) => normalizeRoleKey(r.roleKey))
      .filter(Boolean)
  );
}

function skillNamesFromList(list = []) {
  return new Set(
    list
      .map((item) => (typeof item === 'string' ? item : item?.name))
      .map((s) => normalizeSkillName(s))
      .filter(Boolean)
  );
}

/**
 * @param {object} baseline — from buildStaffingBaselineFromPack
 * @param {object|null} proposal — normalized LLM proposal
 */
function computeStaffingDelta(baseline, proposal) {
  if (!proposal || typeof proposal !== 'object') {
    return {
      rolesAdded: [],
      rolesRemoved: [],
      roleCountChanges: [],
      hoursDeltaPct: null,
      skillsAdded: [],
      skillsRemoved: [],
    };
  }

  const baselineRoleKeys = new Set(Object.keys(baseline?.leafCountByRole || {}));
  const proposalRoleKeys = roleKeysFromProposal(proposal);

  const rolesAdded = [...proposalRoleKeys].filter((k) => !baselineRoleKeys.has(k));
  const rolesRemoved = [...baselineRoleKeys].filter((k) => !proposalRoleKeys.has(k));

  const roleCountChanges = [];
  for (const roleKey of proposalRoleKeys) {
    const baselineFte = Number(baseline?.fteByRole?.[roleKey]) || 0;
    const proposalRow = (proposal.requiredRoles || []).find(
      (r) => normalizeRoleKey(r.roleKey) === roleKey
    );
    const proposalCount = Math.max(1, Number(proposalRow?.requiredCount) || 1);
    if (proposalCount !== baselineFte) {
      roleCountChanges.push({
        roleKey,
        baselineFte,
        proposalCount,
        baselineLeafCount: Number(baseline?.leafCountByRole?.[roleKey]) || 0,
      });
    }
  }

  const baselineSkills = skillNamesFromList(baseline?.rollup?.requiredSkills);
  const proposalSkills = skillNamesFromList(proposal.requiredSkills);
  const skillsAdded = [...proposalSkills].filter((s) => !baselineSkills.has(s));
  const skillsRemoved = [...baselineSkills].filter((s) => !proposalSkills.has(s));

  const totalLeafHours = Number(baseline?.totalLeafHours) || 0;
  const proposalHours =
    proposal.estimatedHoursTotal != null && Number.isFinite(Number(proposal.estimatedHoursTotal))
      ? Number(proposal.estimatedHoursTotal)
      : null;
  let hoursDeltaPct = null;
  if (totalLeafHours > 0 && proposalHours != null) {
    hoursDeltaPct = Math.round((Math.abs(proposalHours - totalLeafHours) / totalLeafHours) * 100);
  }

  return {
    rolesAdded,
    rolesRemoved,
    roleCountChanges,
    hoursDeltaPct,
    skillsAdded,
    skillsRemoved,
  };
}

function collectLeafRoleKeys(pack) {
  const frList = pack?.functionalRequirements || [];
  const keys = new Set();
  for (const row of frList) {
    if (!isFrExecutionLeaf(row, frList)) continue;
    const roleKey = normalizeRoleKey(row.suggestedRoleKey);
    if (roleKey) keys.add(roleKey);
  }
  return keys;
}

module.exports = {
  DEFAULT_FTE_CAPACITY_HOURS,
  collectLeafRoleStats,
  resolveCapacityPerFte,
  buildStaffingBaselineFromPack,
  computeStaffingDelta,
  collectLeafRoleKeys,
};
