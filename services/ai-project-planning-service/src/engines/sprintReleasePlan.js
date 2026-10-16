/**
 * Sprint / Release plan from packed schedule (Step 6).
 * Deterministic bucket — no LLM, does not invent WBS tasks.
 */

const DEFAULT_SPRINT_LENGTH_DAYS = 14;
const DEFAULT_RELEASE_EVERY_N_SPRINTS = 2;
const MAX_SPRINTS = 48;
const MAX_TASKS_PER_SPRINT = 200;

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

function buildSprintWindows(start, end, sprintLengthDays) {
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
    });
    if (cappedEnd >= end) break;
    cursor = addDays(cappedEnd, 1);
    index += 1;
  }
  return windows;
}

function findSprintIndex(windows, dateKey) {
  if (!dateKey || !windows.length) return -1;
  for (let i = 0; i < windows.length; i += 1) {
    if (dateKey >= windows[i].startDate && dateKey <= windows[i].endDate) return i;
  }
  if (dateKey < windows[0].startDate) return 0;
  return windows.length - 1;
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
 * @param {object} [opts]
 * @returns {{ sprints: object[], releases: object[], milestones: object[], meta: object }}
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

  const taskDates =
    input.taskDates && typeof input.taskDates === 'object' && !Array.isArray(input.taskDates)
      ? input.taskDates
      : {};
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const milestones = normalizeMilestones(input.milestones, estimatedEnd);

  if (!projectStart || !estimatedEnd) {
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
          taskCount: 0,
          effortHours: 0,
        });
      }
    }
    return {
      sprints: [],
      releases,
      milestones,
      meta: {
        source: 'engine',
        sprintLengthDays,
        releaseEveryNSprints: releaseEvery,
        deadlineConflict: Boolean(deadlineConflict),
        emptyReason: 'missing_schedule_bounds',
        projectStart: projectStart || null,
        estimatedEnd: estimatedEnd || null,
        deadline: deadline || null,
      },
    };
  }

  const sprints = buildSprintWindows(projectStart, estimatedEnd, sprintLengthDays);

  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    const tid = String(task.id || task.taskId || '').trim();
    if (!tid) continue;
    const dates = taskDates[tid] || {};
    const anchor = toDateKey(
      dates.dueDate || task.dueDate || dates.startDate || task.startDate
    );
    if (!anchor) continue;
    const idx = findSprintIndex(sprints, anchor);
    if (idx < 0) continue;
    const sprint = sprints[idx];
    if (sprint.taskIds.length >= MAX_TASKS_PER_SPRINT) continue;
    if (sprint.taskIds.includes(tid)) continue;
    sprint.taskIds.push(tid);
    sprint.effortHours = roundHours(sprint.effortHours + (Number(task.effortHours) || 0));
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
    releases.push({
      id: `R${rIndex}`,
      name: `Release ${rIndex}`,
      estimatedEnd: last.endDate,
      sprintIds: chunk.map((s) => s.id),
      milestoneIds: msInWindow.map((m) => m.id),
      taskCount: chunk.reduce((n, s) => n + s.taskIds.length, 0),
      effortHours: roundHours(chunk.reduce((n, s) => n + (Number(s.effortHours) || 0), 0)),
    });
  }

  // SC-04: ≥1 release with estimatedEnd unless deadlineConflict flagged
  if (!releases.length && !deadlineConflict) {
    releases.push({
      id: 'R1',
      name: 'Release 1',
      estimatedEnd,
      sprintIds: sprints.map((s) => s.id),
      milestoneIds: milestones.map((m) => m.id),
      taskCount: sprints.reduce((n, s) => n + s.taskIds.length, 0),
      effortHours: roundHours(sprints.reduce((n, s) => n + (Number(s.effortHours) || 0), 0)),
    });
  }

  if (releases.length) {
    releases[releases.length - 1].estimatedEnd = estimatedEnd;
  }

  return {
    sprints,
    releases,
    milestones,
    meta: {
      source: 'engine',
      sprintLengthDays,
      releaseEveryNSprints: releaseEvery,
      deadlineConflict: Boolean(deadlineConflict),
      projectStart,
      estimatedEnd,
      deadline: deadline || null,
      sprintCount: sprints.length,
      releaseCount: releases.length,
    },
  };
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
  toDateKey,
  addDays,
  buildSprintWindows,
  buildSchedulePlan,
  applySchedulePlanToContainer,
  normalizeMilestones,
};
