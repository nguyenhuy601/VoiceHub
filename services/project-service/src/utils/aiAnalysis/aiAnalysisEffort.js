/**
 * Job3 Effort engine (W6) — deterministic; no separate LLM job.
 * Patches tasks with effortHours/requiredLevel; rollup planning.effort.
 */

const { normalizeRoleKey } = require('../requirement/requirementStaffingParse');

const MAX_EFFORT_HOURS = 80;
const MIN_EFFORT_HOURS = 1;
const COMPLEXITY_HOURS = Object.freeze({
  low: 8,
  medium: 16,
  high: 32,
});
const LEVEL_FROM_COMPLEXITY = Object.freeze({
  low: 2,
  medium: 3,
  high: 4,
});

function clampEffortHours(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(MIN_EFFORT_HOURS, Math.min(MAX_EFFORT_HOURS, Math.round(n)));
}

function clampRequiredLevel(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function complexityForTask(task, capabilityById) {
  for (const capId of task.sourceCapabilityIds || []) {
    const cap = capabilityById.get(capId);
    if (cap?.complexity) return String(cap.complexity).toLowerCase();
  }
  return 'medium';
}

/**
 * Patch tasks with effortHours + requiredLevel; build planning.effort rollup.
 */
function runEffortEngine(container, opts = {}) {
  const maxHours = opts.maxEffortHours ?? MAX_EFFORT_HOURS;
  const capabilityById = new Map(
    (container?.analyses?.capability?.items || []).map((c) => [c.capabilityId, c])
  );
  const tasks = Array.isArray(container?.planning?.tasks)
    ? container.planning.tasks.map((t) => ({ ...t }))
    : [];

  const byRole = {};
  let estimatedHoursTotal = 0;

  for (const task of tasks) {
    const complexity = complexityForTask(task, capabilityById);
    let hours = COMPLEXITY_HOURS[complexity] ?? COMPLEXITY_HOURS.medium;
    // Parent delivery nodes lighter coordination
    if (!task.parentId && /delivery|epic|root/i.test(task.name || '')) {
      hours = Math.max(MIN_EFFORT_HOURS, Math.round(hours * 0.5));
    }
    if (task.area === 'qa') hours = Math.max(MIN_EFFORT_HOURS, Math.round(hours * 0.6));

    hours = clampEffortHours(Math.min(hours, maxHours));
    const requiredLevel =
      clampRequiredLevel(LEVEL_FROM_COMPLEXITY[complexity] ?? 3) || 3;

    task.effortHours = hours;
    task.requiredLevel = requiredLevel;
    estimatedHoursTotal += hours;

    const roleKey = normalizeRoleKey(task.suggestedRoleKey) || 'backend_developer';
    byRole[roleKey] = (byRole[roleKey] || 0) + hours;
  }

  const effort = {
    estimatedHoursTotal,
    byRole,
    status: 'ready',
  };

  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    tasks,
    effort,
    meta: {
      source: 'engine',
      llmCalls: 0,
      taskCount: tasks.length,
      maxEffortHours: maxHours,
    },
  };
}

function applyEffortToContainer(container, effortResult) {
  const next = {
    ...container,
    planning: { ...container.planning },
  };
  if (Array.isArray(effortResult.tasks)) {
    next.planning.tasks = effortResult.tasks;
  }
  next.planning.effort = effortResult.effort || null;
  return next;
}

module.exports = {
  MAX_EFFORT_HOURS,
  MIN_EFFORT_HOURS,
  COMPLEXITY_HOURS,
  clampEffortHours,
  clampRequiredLevel,
  runEffortEngine,
  applyEffortToContainer,
};
