/**
 * Ported from project-service/src/utils/aiAnalysis/aiAnalysisEffort.js.
 * Heuristic refinements: area multipliers, name/AC scope, capability complexity.
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

/** Area multipliers vs baseline backend leaf (standard SDLC mix). */
const AREA_HOUR_FACTOR = Object.freeze({
  backend: 1,
  api: 1,
  database: 0.9,
  auth: 1.05,
  frontend: 0.95,
  qa: 0.55,
  design: 0.7,
  infrastructure: 1.15,
  infra: 1.15,
  devops: 1.1,
  management: 0.4,
  analysis: 0.5,
  external: 0.8,
  security: 1.1,
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
  const blob = `${task?.name || ''} ${task?.title || ''} ${task?.area || ''}`.toLowerCase();
  if (/spike|poc|research|investigate|phân\s*tích|thiết\s*kế/.test(blob)) return 'low';
  if (/migrat|integrat|oauth|sso|payment|security|infra|k8s|redis|queue/.test(blob)) {
    return 'high';
  }
  if (/test|qa|ui\b|form|crud|list|export|report/.test(blob)) return 'low';
  return 'medium';
}

function areaFactor(task) {
  const area = String(task?.area || '').toLowerCase().trim();
  if (area && AREA_HOUR_FACTOR[area] != null) return AREA_HOUR_FACTOR[area];
  const role = String(task?.suggestedRoleKey || '').toLowerCase();
  if (/qa|test/.test(role)) return AREA_HOUR_FACTOR.qa;
  if (/front|ui|ux/.test(role)) return AREA_HOUR_FACTOR.frontend;
  if (/devops|sre|infra/.test(role)) return AREA_HOUR_FACTOR.infrastructure;
  return 1;
}

/** Scope proxy from AC indexes / name length — keeps hours from collapsing to 3 buckets. */
function scopeFactor(task) {
  const acCount = Array.isArray(task?.sourceAcIndexes) ? task.sourceAcIndexes.length : 0;
  const nameLen = String(task?.name || task?.title || '').trim().length;
  let factor = 1;
  if (acCount >= 3) factor += 0.25;
  else if (acCount === 2) factor += 0.12;
  if (nameLen >= 80) factor += 0.15;
  else if (nameLen >= 48) factor += 0.08;
  if (/end[\s-]?to[\s-]?end|e2e|regression|full\s*flow/.test(String(task?.name || '').toLowerCase())) {
    factor += 0.2;
  }
  return Math.min(1.6, factor);
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

/** SDLC phase bucket for effort.byPhase (Step 5). */
const EFFORT_PHASES = Object.freeze(['dev', 'qa', 'deploy', 'mgmt']);

function phaseForTask(task) {
  const area = String(task?.area || '').toLowerCase().trim();
  const role = String(task?.suggestedRoleKey || '').toLowerCase();
  const blob = `${area} ${role} ${task?.name || ''} ${task?.title || ''}`.toLowerCase();
  if (/qa|test|uat|e2e|regression/.test(blob)) return 'qa';
  if (/deploy|devops|infra|infrastructure|sre|release|cicd/.test(blob)) return 'deploy';
  if (
    /management|analysis|design|pm\b|ba\b|po\b/.test(blob) ||
    /project_manager|business_analyst|product_owner|tech_lead/.test(role)
  ) {
    return 'mgmt';
  }
  return 'dev';
}

/**
 * Minimum QA hours implied by QualityPlanTool catalog/NFR (does not invent WBS tasks).
 * Cap overlay so thin SRS cannot explode totals.
 */
function qualityPlanDerivedQaHours(qualityPlan, opts = {}) {
  if (!qualityPlan || typeof qualityPlan !== 'object') return 0;
  const catalog = Array.isArray(qualityPlan.catalogPlan) ? qualityPlan.catalogPlan.length : 0;
  const nfr = Array.isArray(qualityPlan.nfrCoverage) ? qualityPlan.nfrCoverage.length : 0;
  const hoursPerTc = Number(opts.hoursPerTc) > 0 ? Number(opts.hoursPerTc) : 2;
  const hoursPerNfr = Number(opts.hoursPerNfr) > 0 ? Number(opts.hoursPerNfr) : 4;
  const maxOverlay = Number(opts.maxOverlay) > 0 ? Number(opts.maxOverlay) : 120;
  const raw = catalog * hoursPerTc + nfr * hoursPerNfr;
  return Math.max(0, Math.min(maxOverlay, Math.round(raw)));
}

function emptyByPhase() {
  return { dev: 0, qa: 0, deploy: 0, mgmt: 0 };
}

function runEffortEngine(container, opts = {}) {
  const maxHours = opts.maxEffortHours ?? MAX_EFFORT_HOURS;
  const historyMetrics = opts.historyMetrics || null;
  const capabilityById = new Map(
    (container?.analyses?.capability?.items || []).map((c) => [c.capabilityId, c])
  );
  const byRole = {};
  const byPhase = emptyByPhase();
  let estimatedHoursTotal = 0;
  let totalStoryPoints = 0;
  let confidenceSum = 0;
  let usedHistoryAny = false;
  const tasks = Array.isArray(container?.planning?.tasks)
    ? container.planning.tasks.map((t) => ({ ...t }))
    : [];

  for (const task of tasks) {
    const complexity = complexityForTask(task, capabilityById);
    const seedHint = Number(task.effortSeedHours);
    if (Number.isFinite(seedHint) && seedHint > 0) {
      task.effortSeedHintHours = seedHint;
    }

    const level = String(task.level || '').toLowerCase();
    const phase = phaseForTask(task);
    const requiredLevel =
      clampRequiredLevel(LEVEL_FROM_COMPLEXITY[complexity] ?? 3) || 3;

    // P1: WBS duplicate leaves stay for trace/coverage but do not double-count hours.
    if (task.duplicateOf) {
      task.effortHours = 0;
      task.requiredLevel = requiredLevel;
      task.storyPoints = 0;
      task.confidence = 0;
      task.complexity = complexity;
      task.effortPhase = phase;
      continue;
    }

    // P1: official estimate from complexity — never use effortSeedHours as base.
    let hours = COMPLEXITY_HOURS[complexity] ?? COMPLEXITY_HOURS.medium;

    if (level === 'epic' || level === 'feature' || level === 'story') {
      hours = Math.max(MIN_EFFORT_HOURS, Math.round(hours * 0.25));
    } else if (!task.parentId && /delivery|epic|root/i.test(task.name || '')) {
      hours = Math.max(MIN_EFFORT_HOURS, Math.round(hours * 0.5));
    } else {
      hours = hours * areaFactor(task) * scopeFactor(task);
    }

    const blended = blendHoursWithHistory(hours, complexity, historyMetrics);
    if (blended.usedHistory) usedHistoryAny = true;
    hours = clampEffortHours(Math.min(blended.hours, maxHours));
    const storyPoints = COMPLEXITY_STORY_POINTS[complexity] ?? COMPLEXITY_STORY_POINTS.medium;
    const confidence = clamp01(blended.confidence);

    task.effortHours = hours;
    task.requiredLevel = requiredLevel;
    task.storyPoints = storyPoints;
    task.confidence = confidence;
    task.complexity = complexity;
    task.effortPhase = phase;
    estimatedHoursTotal += hours;
    totalStoryPoints += storyPoints;
    confidenceSum += confidence;
    byPhase[phase] = (byPhase[phase] || 0) + hours;
    const roleKey = normalizeRoleKey(task.suggestedRoleKey) || 'backend_developer';
    byRole[roleKey] = (byRole[roleKey] || 0) + hours;
  }

  // Ensure QA phase reflects Quality Plan when WBS has few/no qa leaves
  const derivedQa = qualityPlanDerivedQaHours(container?.planning?.qualityPlan, opts);
  const qaFromTasks = byPhase.qa || 0;
  const qualityPlanDerivedHours = Math.max(0, derivedQa - qaFromTasks);
  if (qualityPlanDerivedHours > 0) {
    byPhase.qa = qaFromTasks + qualityPlanDerivedHours;
    estimatedHoursTotal += qualityPlanDerivedHours;
    const qaRole = 'qa_engineer';
    byRole[qaRole] = (byRole[qaRole] || 0) + qualityPlanDerivedHours;
  }

  const confidence =
    tasks.length > 0 ? clamp01(confidenceSum / tasks.length) : historyMetrics ? 0.6 : 0.55;

  const effort = {
    estimatedHoursTotal,
    byRole,
    byPhase,
    qualityPlanDerivedHours,
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
      usedHistory: usedHistoryAny,
      qualityPlanDerivedHours,
      byPhase,
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
  AREA_HOUR_FACTOR,
  EFFORT_PHASES,
  clampEffortHours,
  clampRequiredLevel,
  complexityForTask,
  areaFactor,
  scopeFactor,
  phaseForTask,
  qualityPlanDerivedQaHours,
  runEffortEngine,
  applyEffortToContainer,
};
