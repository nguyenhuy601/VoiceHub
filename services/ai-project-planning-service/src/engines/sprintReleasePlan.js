/**
 * Sprint / Release windows for Schedule Step 6.
 * Creates empty sprint windows (dates + capacity only).
 * Does NOT assign leaves/PBIs — Sprint HOW LangGraph (LLM propose + validate) owns allocation.
 * Leaves stay in unallocated with reason awaiting_llm_allocation.
 */

const DEFAULT_SPRINT_LENGTH_DAYS = 14;
const DEFAULT_RELEASE_EVERY_N_SPRINTS = 2;
const MAX_SPRINTS = 48;
const HOURS_PER_WORKING_DAY = 8;

function toDateKey(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function roundHours(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function workingDaysInSprint(sprintLengthDays) {
  return Math.max(1, Math.round((Number(sprintLengthDays) || 14) * 5 / 7));
}

/** One-person sprint capacity (window sizing only — not validated team SoT). */
function onePersonSprintCapacityHours(sprintLengthDays) {
  return workingDaysInSprint(sprintLengthDays) * HOURS_PER_WORKING_DAY;
}

/**
 * Resolve team FTE for sprint capacity.
 * Prefer explicit opts; else count roles/members with supply; else null → capacity_unverified.
 */
function resolveTeamFteCount(capacityPlan, opts = {}) {
  if (Number(opts.teamFteCount) > 0) return Math.max(1, Math.floor(Number(opts.teamFteCount)));
  if (Number(opts.teamMemberCount) > 0) {
    return Math.max(1, Math.floor(Number(opts.teamMemberCount)));
  }
  const byRole = Array.isArray(capacityPlan?.byRole) ? capacityPlan.byRole : [];
  if (byRole.length) {
    const rolesWithSupply = byRole.filter((row) => Number(row?.supplyHours) > 0).length;
    if (rolesWithSupply > 0) return rolesWithSupply;
  }
  if (Number(capacityPlan?.teamMemberCount) > 0) {
    return Math.max(1, Math.floor(Number(capacityPlan.teamMemberCount)));
  }
  return null;
}

function teamSprintCapacityHours(sprintLengthDays, teamFteCount) {
  if (teamFteCount == null || !(Number(teamFteCount) > 0)) return null;
  return roundHours(onePersonSprintCapacityHours(sprintLengthDays) * Number(teamFteCount));
}

function buildSprintWindows(start, end, sprintLengthDays, capacityHours = null) {
  const windows = [];
  let cursor = start;
  let index = 1;
  while (cursor <= end && windows.length < MAX_SPRINTS) {
    const sprintEnd = addDays(cursor, sprintLengthDays - 1);
    const cappedEnd = sprintEnd > end ? end : sprintEnd;
    windows.push({
      id: `S${index}`,
      name: `Sprint ${index}`,
      startDate: cursor,
      endDate: cappedEnd,
      taskIds: [],
      effortHours: 0,
      capacityHours: capacityHours == null ? null : capacityHours,
      utilizationPct: 0,
    });
    if (cappedEnd >= end) break;
    cursor = addDays(cappedEnd, 1);
    index += 1;
  }
  return windows;
}

function isScheduleLeaf(task) {
  const level = String(task?.level || 'task').toLowerCase();
  return level !== 'epic' && level !== 'feature' && level !== 'story' && level !== 'work_package';
}

function taskEffortHours(task) {
  const hours = Number(task?.effortHours ?? task?.effortSeedHours);
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

function utilizationPct(effortHours, capacityHours) {
  if (capacityHours == null || !(Number(capacityHours) > 0)) return null;
  return Math.round((Number(effortHours) / Number(capacityHours)) * 10000) / 100;
}

function refreshSprintUtilization(sprint) {
  sprint.utilizationPct = utilizationPct(sprint.effortHours, sprint.capacityHours);
  return sprint;
}

function pushUnallocated(unallocated, entry) {
  if (!entry || (!entry.taskId && !entry.pbiId)) return;
  unallocated.push({
    taskId: entry.taskId ? String(entry.taskId) : null,
    pbiId: entry.pbiId ? String(entry.pbiId) : null,
    reasonCode: String(entry.reasonCode || 'not_ready'),
    reason: String(entry.reason || '').trim() || String(entry.reasonCode || 'not_ready'),
  });
}

/**
 * Pre-LLM: do not flood unallocated (looks like a hard failure on Gate2).
 * Count is tracked on schedulePlan.meta.awaitingLlmTaskCount instead.
 */
function leavesAwaitingLlm(_leaves) {
  return [];
}

function countLeafTasks(leaves) {
  let n = 0;
  for (const task of leaves || []) {
    if (String(task?.id || task?.taskId || '').trim()) n += 1;
  }
  return n;
}

/**
 * Empty sprint windows sized from total leaf effort (no task assignment).
 * Used when project calendar bounds are missing.
 */
function estimateEmptySprintWindows(leaves, start, sprintLengthDays, opts = {}) {
  const teamFte = resolveTeamFteCount(opts.capacityPlan, opts);
  const capacityUnverified = teamFte == null;
  const capacity = capacityUnverified
    ? onePersonSprintCapacityHours(sprintLengthDays)
    : teamSprintCapacityHours(sprintLengthDays, teamFte);
  const totalEffort = leaves.reduce((sum, task) => {
    const hours = taskEffortHours(task) || HOURS_PER_WORKING_DAY;
    return sum + hours;
  }, 0);
  const perSprint = capacity > 0 ? capacity : onePersonSprintCapacityHours(sprintLengthDays);
  const needed = Math.max(1, Math.min(MAX_SPRINTS, Math.ceil(totalEffort / perSprint) || 1));
  const sprints = [];
  let cursor = start;
  for (let i = 0; i < needed; i += 1) {
    const sprintEnd = addDays(cursor, sprintLengthDays - 1);
    sprints.push({
      id: `S${i + 1}`,
      name: `Sprint ${i + 1}`,
      startDate: cursor,
      endDate: sprintEnd,
      taskIds: [],
      pbiIds: [],
      effortHours: 0,
      capacityHours: capacityUnverified ? null : capacity,
      utilizationPct: capacityUnverified ? null : 0,
      goal: '',
    });
    cursor = addDays(sprintEnd, 1);
  }
  return {
    sprints,
    estimatedEnd: sprints.length ? sprints[sprints.length - 1].endDate : start,
    unallocated: leavesAwaitingLlm(leaves),
    awaitingLlmTaskCount: countLeafTasks(leaves),
    capacityUnverified,
    teamFteCount: teamFte,
    teamCapacityHoursPerSprint: capacityUnverified ? null : capacity,
  };
}

function uniqueTaskIdsFromSprints(sprintChunk) {
  const seen = new Set();
  const ids = [];
  for (const sprint of sprintChunk) {
    for (const tid of Array.isArray(sprint?.taskIds) ? sprint.taskIds : []) {
      const id = String(tid || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function finishPlan(sprints, estimatedEnd, opts) {
  const {
    milestones = [],
    releaseEvery = DEFAULT_RELEASE_EVERY_N_SPRINTS,
    sprintLengthDays = DEFAULT_SPRINT_LENGTH_DAYS,
    deadline = null,
    deadlineConflict = false,
    projectStart = null,
    sourceNote = null,
    unallocated = [],
    capacityUnverified = false,
    teamFteCount = null,
    teamCapacityHoursPerSprint = null,
    awaitingLlmTaskCount = null,
  } = opts || {};

  for (const sprint of sprints) {
    refreshSprintUtilization(sprint);
  }

  const releases = [];
  for (let i = 0; i < sprints.length; i += releaseEvery) {
    const chunk = sprints.slice(i, i + releaseEvery);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const rIndex = releases.length + 1;
    const msInWindow = milestones.filter(
      (m) =>
        m.estimatedEnd &&
        m.estimatedEnd >= first.startDate &&
        m.estimatedEnd <= last.endDate
    );
    const dedupedTaskIds = uniqueTaskIdsFromSprints(chunk);
    const effortHours = roundHours(
      chunk.reduce((n, s) => n + (Number(s.effortHours) || 0), 0)
    );
    releases.push({
      id: `R${rIndex}`,
      name: `Release ${rIndex}`,
      startDate: first.startDate || null,
      estimatedEnd: last.endDate,
      sprintIds: chunk.map((s) => s.id),
      milestoneIds: msInWindow.map((m) => m.id),
      taskIds: dedupedTaskIds,
      taskCount: dedupedTaskIds.length,
      effortHours,
    });
  }
  if (!releases.length && !deadlineConflict && estimatedEnd) {
    const dedupedTaskIds = uniqueTaskIdsFromSprints(sprints);
    releases.push({
      id: 'R1',
      name: 'Release 1',
      startDate: sprints[0]?.startDate || null,
      estimatedEnd,
      sprintIds: sprints.map((s) => s.id),
      milestoneIds: milestones.map((m) => m.id),
      taskIds: dedupedTaskIds,
      taskCount: dedupedTaskIds.length,
      effortHours: roundHours(sprints.reduce((n, s) => n + (Number(s.effortHours) || 0), 0)),
    });
  }
  if (releases.length && estimatedEnd) {
    releases[releases.length - 1].estimatedEnd = estimatedEnd;
  }
  return {
    sprints,
    releases,
    milestones,
    unallocated: Array.isArray(unallocated) ? unallocated : [],
    deferred: [],
    conflicts: [],
    meta: {
      source: 'engine',
      sprintLengthDays,
      releaseEveryNSprints: releaseEvery,
      deadlineConflict: Boolean(deadlineConflict),
      projectStart: projectStart || null,
      estimatedEnd: estimatedEnd || null,
      deadline: deadline || null,
      sprintCount: sprints.length,
      releaseCount: releases.length,
      unallocatedCount: Array.isArray(unallocated) ? unallocated.length : 0,
      capacityUnverified: Boolean(capacityUnverified),
      teamFteCount: teamFteCount == null ? null : teamFteCount,
      teamCapacityHoursPerSprint:
        teamCapacityHoursPerSprint == null ? null : teamCapacityHoursPerSprint,
      ...(sourceNote ? { packMode: sourceNote } : {}),
      allocationOwner: 'sprint_how_llm',
      ...(awaitingLlmTaskCount != null ? { awaitingLlmTaskCount } : {}),
    },
  };
}

function normalizeMilestones(raw, fallbackEnd) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((m, i) => {
      if (!m || typeof m !== 'object') return null;
      const dateKey =
        toDateKey(m.dateKey || m.date || m.estimatedEnd || m.dueDate) || fallbackEnd || null;
      const id = String(m.id || m.taskId || `MS-${i + 1}`).trim();
      if (!id) return null;
      return {
        id,
        taskId: m.taskId ? String(m.taskId) : null,
        name: String(m.name || m.title || id).trim() || id,
        dateKey,
        estimatedEnd: dateKey,
      };
    })
    .filter(Boolean);
}

/**
 * @param {object} input
 * @param {object} [input.completion]
 * @param {object} [input.taskDates]
 * @param {object[]} [input.tasks]
 * @param {object[]} [input.milestones]
 * @param {object[]} [input.capacityConflicts]
 * @param {object} [input.capacityPlan]
 * @param {object} [opts]
 * @returns {object}
 */
function buildSchedulePlan(input = {}, opts = {}) {
  const completion = input.completion && typeof input.completion === 'object' ? input.completion : {};
  const projectStart = toDateKey(completion.projectStart || input.projectStart);
  const estimatedEnd = toDateKey(completion.estimatedEnd || input.estimatedEnd);
  const deadline = toDateKey(completion.deadline || input.deadline);
  const conflicts = Array.isArray(input.capacityConflicts) ? input.capacityConflicts : [];
  const deadlineConflict =
    conflicts.some((c) => String(c?.type || '') === 'past_deadline') ||
    Boolean(deadline && estimatedEnd && estimatedEnd > deadline);

  const sprintLengthDays =
    Number(opts.sprintLengthDays) > 0
      ? Math.min(60, Math.floor(Number(opts.sprintLengthDays)))
      : DEFAULT_SPRINT_LENGTH_DAYS;
  const releaseEvery =
    Number(opts.releaseEveryNSprints) > 0
      ? Math.min(12, Math.floor(Number(opts.releaseEveryNSprints)))
      : DEFAULT_RELEASE_EVERY_N_SPRINTS;

  const capacityPlan =
    input.capacityPlan && typeof input.capacityPlan === 'object' ? input.capacityPlan : opts.capacityPlan || null;
  const teamFte = resolveTeamFteCount(capacityPlan, opts);
  const capacityUnverified = teamFte == null;
  const teamCapacityHoursPerSprint = teamSprintCapacityHours(sprintLengthDays, teamFte);

  // taskDates retained for callers / future validators — windows are calendar-only here.
  void input.taskDates;
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const milestones = normalizeMilestones(input.milestones, estimatedEnd);

  const leaves = tasks.filter((task) => task && isScheduleLeaf(task) && String(task.id || task.taskId || '').trim());

  if (!projectStart || !estimatedEnd) {
    if (leaves.length) {
      const start = toDateKey(new Date().toISOString());
      const estimated = estimateEmptySprintWindows(leaves, start, sprintLengthDays, {
        capacityPlan,
        teamFteCount: opts.teamFteCount,
        teamMemberCount: opts.teamMemberCount,
      });
      return finishPlan(estimated.sprints, estimated.estimatedEnd, {
        milestones,
        releaseEvery,
        sprintLengthDays,
        deadline,
        deadlineConflict,
        projectStart: start,
        sourceNote: 'windows_only_no_heuristic_assign',
        unallocated: estimated.unallocated,
        awaitingLlmTaskCount: estimated.awaitingLlmTaskCount,
        capacityUnverified: estimated.capacityUnverified,
        teamFteCount: estimated.teamFteCount,
        teamCapacityHoursPerSprint: estimated.teamCapacityHoursPerSprint,
      });
    }
    const releases = [];
    if (!deadlineConflict) {
      const endFromMs = milestones.find((m) => m.estimatedEnd)?.estimatedEnd || null;
      if (endFromMs) {
        releases.push({
          id: 'R1',
          name: 'Release 1',
          estimatedEnd: endFromMs,
          sprintIds: [],
          milestoneIds: milestones.map((m) => m.id),
          taskIds: [],
          taskCount: 0,
          effortHours: 0,
        });
      }
    }
    return {
      sprints: [],
      releases,
      milestones,
      unallocated: [],
      deferred: [],
      conflicts: [],
      meta: {
        source: 'engine',
        sprintLengthDays,
        releaseEveryNSprints: releaseEvery,
        deadlineConflict: Boolean(deadlineConflict),
        emptyReason: 'missing_schedule_bounds',
        projectStart: projectStart || null,
        estimatedEnd: estimatedEnd || null,
        deadline: deadline || null,
        unallocatedCount: 0,
        capacityUnverified,
        teamFteCount: teamFte,
        teamCapacityHoursPerSprint,
        allocationOwner: 'sprint_how_llm',
      },
    };
  }

  const sprints = buildSprintWindows(
    projectStart,
    estimatedEnd,
    sprintLengthDays,
    teamCapacityHoursPerSprint
  ).map((sprint) => ({
    ...sprint,
    pbiIds: [],
    goal: '',
  }));
  const unallocated = leavesAwaitingLlm(leaves);

  return finishPlan(sprints, estimatedEnd, {
    milestones,
    releaseEvery,
    sprintLengthDays,
    deadline,
    deadlineConflict,
    projectStart,
    sourceNote: 'windows_only_no_heuristic_assign',
    unallocated,
    awaitingLlmTaskCount: countLeafTasks(leaves),
    capacityUnverified,
    teamFteCount: teamFte,
    teamCapacityHoursPerSprint,
  });
}

function applySchedulePlanToContainer(container, schedulePlan) {
  const next = {
    ...container,
    planning: {
      ...(container?.planning || {}),
      schedulePlan: schedulePlan || null,
    },
  };
  if (schedulePlan && Array.isArray(schedulePlan.milestones)) {
    next.planning.milestones = schedulePlan.milestones;
  }
  return next;
}

module.exports = {
  DEFAULT_SPRINT_LENGTH_DAYS,
  DEFAULT_RELEASE_EVERY_N_SPRINTS,
  HOURS_PER_WORKING_DAY,
  toDateKey,
  addDays,
  buildSprintWindows,
  buildSchedulePlan,
  applySchedulePlanToContainer,
  normalizeMilestones,
  resolveTeamFteCount,
  teamSprintCapacityHours,
  onePersonSprintCapacityHours,
  estimateEmptySprintWindows,
  leavesAwaitingLlm,
  isScheduleLeaf,
  taskEffortHours,
};
