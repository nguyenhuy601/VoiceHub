/**
 * Ported from project-service/src/utils/aiAnalysis/aiAnalysisEffort.js.
 * Keep deterministic behavior in parity with the legacy production engine.
 */
const { normalizeRoleKey } = require('./roleKey');

const MAX_EFFORT_HOURS = 80;
const MIN_EFFORT_HOURS = 1;
const COMPLEXITY_HOURS = Object.freeze({
  low: 8,
  medium: 16,
  high: 32,
});
const COMPLEXITY_STORY_POINTS = Object.freeze({
  low: 1,
  medium: 3,
  high: 5,
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

function clamp01(raw, fallback = 0.55) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}

function complexityForTask(task, capabilityById) {
  for (const capId of task.sourceCapabilityIds || []) {
    const cap = capabilityById.get(capId);
    if (cap?.complexity) return String(cap.complexity).toLowerCase();
  }
  return 'medium';
}

function blendHoursWithHistory(baseHours, complexity, historyMetrics) {
  if (!historyMetrics || typeof historyMetrics !== 'object') {
    return { hours: baseHours, confidence: 0.55, usedHistory: false };
  }
  const sampleSize = Math.max(0, Number(historyMetrics.sampleSize) || 0);
  const hoursByComplexity =
    historyMetrics.hoursByComplexity && typeof historyMetrics.hoursByComplexity === 'object'
      ? historyMetrics.hoursByComplexity
      : null;
  const historyHours = Number(hoursByComplexity?.[complexity]);
  if (!Number.isFinite(historyHours) || historyHours <= 0) {
    return {
      hours: baseHours,
      confidence: clamp01(0.55 + Math.min(0.2, sampleSize / 100)),
      usedHistory: false,
    };
  }
  const weight = Math.min(0.2, sampleSize / 50);
  const blended = baseHours * (1 - weight) + historyHours * weight;
  const confidence = clamp01(0.55 + Math.min(0.4, sampleSize / 50));
  return { hours: blended, confidence, usedHistory: weight > 0 };
}

function runEffortEngine(container, opts = {}) {
  const maxHours = opts.maxEffortHours ?? MAX_EFFORT_HOURS;
  const historyMetrics = opts.historyMetrics || null;
  const capabilityById = new Map(
    (container?.analyses?.capability?.items || []).map((c) => [c.capabilityId, c])
  );
  const byRole = {};
  let estimatedHoursTotal = 0;
  let totalStoryPoints = 0;
  let confidenceSum = 0;
  const tasks = Array.isArray(container?.planning?.tasks)
    ? container.planning.tasks.map((t) => ({ ...t }))
    : [];

  for (const task of tasks) {
    const complexity = complexityForTask(task, capabilityById);
    let hours = COMPLEXITY_HOURS[complexity] ?? COMPLEXITY_HOURS.medium;
    if (!task.parentId && /delivery|epic|root/i.test(task.name || '')) {
      hours = Math.max(MIN_EFFORT_HOURS, Math.round(hours * 0.5));
    }
    if (task.area === 'qa') hours = Math.max(MIN_EFFORT_HOURS, Math.round(hours * 0.6));

    const blended = blendHoursWithHistory(hours, complexity, historyMetrics);
    hours = clampEffortHours(Math.min(blended.hours, maxHours));
    const requiredLevel =
      clampRequiredLevel(LEVEL_FROM_COMPLEXITY[complexity] ?? 3) || 3;
    const storyPoints = COMPLEXITY_STORY_POINTS[complexity] ?? COMPLEXITY_STORY_POINTS.medium;
    const confidence = clamp01(blended.confidence);

    task.effortHours = hours;
    task.requiredLevel = requiredLevel;
    task.storyPoints = storyPoints;
    task.confidence = confidence;
    estimatedHoursTotal += hours;
    totalStoryPoints += storyPoints;
    confidenceSum += confidence;
    const roleKey = normalizeRoleKey(task.suggestedRoleKey) || 'backend_developer';
    byRole[roleKey] = (byRole[roleKey] || 0) + hours;
  }

  const confidence =
    tasks.length > 0 ? clamp01(confidenceSum / tasks.length) : historyMetrics ? 0.6 : 0.55;

  const effort = {
    estimatedHoursTotal,
    byRole,
    totalStoryPoints,
    confidence,
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
      historyBlended: Boolean(historyMetrics),
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
  COMPLEXITY_STORY_POINTS,
  clampEffortHours,
  clampRequiredLevel,
  runEffortEngine,
  applyEffortToContainer,
};
