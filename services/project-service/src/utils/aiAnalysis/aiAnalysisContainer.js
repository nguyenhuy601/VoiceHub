/**
 * pack.aiAnalysis container helpers — empty shells + status gates (schema v2).
 */

const {
  AI_ANALYSIS_SCHEMA_VERSION,
  AI_ANALYSIS_ALL_JOB_KEYS,
  AI_ANALYSIS_USER_JOBS,
  AI_ANALYSIS_SECTION_KEYS,
  AI_ANALYSIS_JOB_OUTPUT_MAP,
  isAiAnalysisUserJob,
  previousUserJob,
  userJobsAfter,
} = require('../../constants/aiAnalysisJobs.constants');
const { buildRequirementAnalysisGapPreview } = require('./aiAnalysisGap');
const {
  migrateAiAnalysisJobsV1ToV2,
  needsJobMigration,
} = require('./aiAnalysisMigrateJobs');
const {
  listFeatureRows,
  buildFrChildrenByParent,
} = require('../requirement/requirementFrLevel');
const { normId } = require('../requirement/requirementTemplateTextNorm');

function emptyJobMeta() {
  return {
    status: 'empty',
    model: null,
    generatedAt: null,
    confirmedAt: null,
    durationMs: null,
    error: null,
  };
}

function normalizeDurationMs(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function emptyAnalysisSection() {
  return {
    status: 'empty',
    model: null,
    generatedAt: null,
    items: [],
    entities: [],
    edges: [],
    dataFlows: [],
    orderHint: [],
    chains: [],
    meta: {},
  };
}

function emptyHierarchySection() {
  return {
    status: 'empty',
    model: null,
    generatedAt: null,
    proposedFeatures: [],
    proposedRequirements: [],
    items: [],
    entities: [],
    edges: [],
    dataFlows: [],
    orderHint: [],
    chains: [],
    meta: {
      agileMap: {
        Module: 'Epic',
        Feature: 'Feature',
        Requirement: 'Requirement',
      },
    },
  };
}

function normalizeHierarchySection(src) {
  const base = emptyHierarchySection();
  if (!src || typeof src !== 'object') return base;
  const metaSrc = src.meta && typeof src.meta === 'object' ? src.meta : {};
  return {
    status: String(src.status || 'empty'),
    model: src.model ?? null,
    generatedAt: src.generatedAt ?? null,
    proposedFeatures: Array.isArray(src.proposedFeatures) ? src.proposedFeatures : [],
    proposedRequirements: Array.isArray(src.proposedRequirements)
      ? src.proposedRequirements
      : [],
    items: Array.isArray(src.items) ? src.items : [],
    entities: Array.isArray(src.entities) ? src.entities : [],
    edges: Array.isArray(src.edges) ? src.edges : [],
    dataFlows: Array.isArray(src.dataFlows) ? src.dataFlows : [],
    orderHint: Array.isArray(src.orderHint) ? src.orderHint : [],
    chains: Array.isArray(src.chains) ? src.chains : [],
    meta: {
      ...base.meta,
      ...metaSrc,
      agileMap: {
        ...base.meta.agileMap,
        ...(metaSrc.agileMap && typeof metaSrc.agileMap === 'object' ? metaSrc.agileMap : {}),
      },
    },
  };
}

function emptyPlanningShell() {
  return {
    wbs: null,
    tasks: [],
    roles: [],
    skills: [],
    effort: null,
    sequence: null,
    theoreticalCpm: null,
    criticalWorkIds: [],
    completion: null,
    executionPlan: null,
  };
}

function emptyResourceShell() {
  return {
    fte: [],
    recommendations: [],
    assignments: [],
    assignmentsMeta: {},
    schedule: [],
  };
}

function createEmptyAiAnalysisContainer() {
  const jobs = {};
  for (const key of AI_ANALYSIS_ALL_JOB_KEYS) {
    jobs[key] = emptyJobMeta();
  }
  const analyses = {};
  for (const key of AI_ANALYSIS_SECTION_KEYS) {
    analyses[key] = key === 'hierarchy' ? emptyHierarchySection() : emptyAnalysisSection();
  }
  return {
    schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
    generatedAt: null,
    currentJob: null,
    jobs,
    analyses,
    planning: emptyPlanningShell(),
    resource: emptyResourceShell(),
  };
}

function normalizeJobMeta(src) {
  if (!src || typeof src !== 'object') return emptyJobMeta();
  return {
    status: String(src.status || 'empty'),
    model: src.model ?? null,
    generatedAt: src.generatedAt ?? null,
    confirmedAt: src.confirmedAt ?? null,
    durationMs: normalizeDurationMs(src.durationMs),
    error: src.error ?? null,
  };
}

/** Confirm gate: capability must have ≥1 item. */
function assertCapabilityConfirmable(container) {
  const items = container?.analyses?.capability?.items;
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Capability analysis has no items to confirm');
    err.statusCode = 409;
    err.errorCode = 'AI_ANALYSIS_CAPABILITY_EMPTY';
    err.details = { job: 'capabilityAnalysis', itemCount: 0 };
    throw err;
  }
}

/** True when capability analysis has no items. */
function capabilityItemsEmpty(container) {
  const items = container?.analyses?.capability?.items;
  return !Array.isArray(items) || items.length === 0;
}

/**
 * ready + empty capability items (before Confirm) → stale so user can re-run.
 * @returns {{ container: object, changed: boolean }}
 */
function normalizeEmptyCapabilityReady(container) {
  if (!container || typeof container !== 'object') {
    return { container, changed: false };
  }
  const jobMeta = container.jobs?.capabilityAnalysis;
  if (!jobMeta || typeof jobMeta !== 'object') {
    return { container, changed: false };
  }
  if (String(jobMeta.status || '') !== 'ready') {
    return { container, changed: false };
  }
  if (!capabilityItemsEmpty(container)) {
    return { container, changed: false };
  }
  const next = {
    ...container,
    jobs: {
      ...container.jobs,
      capabilityAnalysis: {
        ...jobMeta,
        status: 'stale',
        confirmedAt: null,
        error: jobMeta.error || 'empty_requirement_leaves',
      },
    },
  };
  return { container: next, changed: true };
}

function ensureAiAnalysisContainer(raw) {
  const base = createEmptyAiAnalysisContainer();
  if (!raw || typeof raw !== 'object') return base;

  let working = raw;
  if (needsJobMigration(raw)) {
    const { jobs: migratedJobs } = migrateAiAnalysisJobsV1ToV2(raw.jobs || {});
    working = { ...raw, jobs: migratedJobs, schemaVersion: AI_ANALYSIS_SCHEMA_VERSION };
  }

  const jobs = { ...base.jobs };
  for (const key of AI_ANALYSIS_ALL_JOB_KEYS) {
    const src = working.jobs?.[key];
    if (src && typeof src === 'object') {
      jobs[key] = normalizeJobMeta(src);
    }
  }

  const analyses = { ...base.analyses };
  for (const key of AI_ANALYSIS_SECTION_KEYS) {
    const src = working.analyses?.[key];
    if (src && typeof src === 'object') {
      if (key === 'hierarchy') {
        analyses[key] = normalizeHierarchySection(src);
      } else {
        analyses[key] = {
          status: String(src.status || 'empty'),
          model: src.model ?? null,
          generatedAt: src.generatedAt ?? null,
          items: Array.isArray(src.items) ? src.items : [],
          entities: Array.isArray(src.entities) ? src.entities : [],
          edges: Array.isArray(src.edges) ? src.edges : [],
          dataFlows: Array.isArray(src.dataFlows) ? src.dataFlows : [],
          orderHint: Array.isArray(src.orderHint) ? src.orderHint : [],
          chains: Array.isArray(src.chains) ? src.chains : [],
          meta: src.meta && typeof src.meta === 'object' ? src.meta : {},
        };
      }
    }
  }

  const planningSrc = working.planning && typeof working.planning === 'object' ? working.planning : {};
  const resourceSrc = working.resource && typeof working.resource === 'object' ? working.resource : {};

  const built = {
    schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
    generatedAt: working.generatedAt ?? null,
    currentJob: working.currentJob ?? null,
    jobs,
    analyses,
    planning: {
      wbs: planningSrc.wbs ?? null,
      tasks: Array.isArray(planningSrc.tasks) ? planningSrc.tasks : [],
      roles: Array.isArray(planningSrc.roles) ? planningSrc.roles : [],
      skills: Array.isArray(planningSrc.skills) ? planningSrc.skills : [],
      effort: planningSrc.effort ?? null,
      sequence: planningSrc.sequence ?? null,
      theoreticalCpm: planningSrc.theoreticalCpm ?? null,
      criticalWorkIds: Array.isArray(planningSrc.criticalWorkIds)
        ? planningSrc.criticalWorkIds
        : [],
      completion: planningSrc.completion ?? null,
      executionPlan: planningSrc.executionPlan ?? null,
    },
    resource: {
      fte: Array.isArray(resourceSrc.fte) ? resourceSrc.fte : [],
      recommendations: Array.isArray(resourceSrc.recommendations)
        ? resourceSrc.recommendations
        : [],
      assignments: Array.isArray(resourceSrc.assignments) ? resourceSrc.assignments : [],
      assignmentsMeta:
        resourceSrc.assignmentsMeta && typeof resourceSrc.assignmentsMeta === 'object'
          ? resourceSrc.assignmentsMeta
          : {},
      schedule: Array.isArray(resourceSrc.schedule) ? resourceSrc.schedule : [],
    },
  };

  return normalizeEmptyCapabilityReady(built).container;
}

function assertSchemaVersionPresent(container) {
  const v = Number(container?.schemaVersion);
  if (!Number.isFinite(v) || v < 1) {
    const err = new Error('aiAnalysis.schemaVersion is required');
    err.statusCode = 422;
    err.errorCode = 'AI_ANALYSIS_SCHEMA_VERSION_REQUIRED';
    throw err;
  }
}

function getJobStatus(container, job) {
  return String(container?.jobs?.[job]?.status || 'empty');
}

function assertPreviousJobConfirmed(container, job) {
  const prev = previousUserJob(job);
  if (!prev) return;
  const status = getJobStatus(container, prev);
  if (status !== 'confirmed') {
    const err = new Error(
      `Job ${job} requires previous job ${prev} to be confirmed (current: ${status})`
    );
    err.statusCode = 409;
    err.errorCode = 'AI_ANALYSIS_PREV_JOB_NOT_CONFIRMED';
    err.details = { job, previousJob: prev, previousStatus: status };
    throw err;
  }
}

/** True when any Feature row has no Requirement children (stuck hierarchy leaf gap). */
function packHasFeatureWithoutRequirement(frList = []) {
  const childrenByParent = buildFrChildrenByParent(frList || []);
  for (const row of listFeatureRows(frList || [])) {
    const rawId = String(row.externalId || '').trim();
    const nid = normId(row.externalId);
    const kids = [
      ...(childrenByParent.get(rawId) || []),
      ...(nid && nid !== rawId ? childrenByParent.get(nid) || [] : []),
    ];
    const hasRequirement = kids.some((c) => String(c.level || '').trim() === 'Requirement');
    if (!hasRequirement) return true;
  }
  return false;
}

/** Confirmed jobs cannot be re-run (force does not bypass), except hierarchy stuck recovery. */
function assertJobNotConfirmedForRerun(container, job, opts = {}) {
  const status = getJobStatus(container, job);
  if (status !== 'confirmed') return;
  if (
    String(job || '').trim() === 'hierarchyDecomposition' &&
    packHasFeatureWithoutRequirement(opts.frList || opts.functionalRequirements || [])
  ) {
    return;
  }
  const err = new Error(`Job ${job} is already confirmed and cannot be re-run`);
  err.statusCode = 409;
  err.errorCode = 'AI_ANALYSIS_JOB_ALREADY_CONFIRMED';
  err.details = { job, status };
  throw err;
}

function markJobsStaleAfter(container, job) {
  const next = ensureAiAnalysisContainer(container);
  for (const key of userJobsAfter(job)) {
    const st = next.jobs[key].status;
    if (st === 'empty') continue;
    next.jobs[key] = {
      ...next.jobs[key],
      status: 'stale',
      error: null,
    };
  }
  for (const key of ['final']) {
    if (next.jobs[key] && next.jobs[key].status !== 'empty') {
      next.jobs[key] = { ...next.jobs[key], status: 'stale', error: null };
    }
  }
  return next;
}

function summarizeAiAnalysis(container) {
  const c = ensureAiAnalysisContainer(container);
  const jobs = {};
  for (const key of AI_ANALYSIS_ALL_JOB_KEYS) {
    const meta = c.jobs[key];
    jobs[key] = {
      status: meta.status,
      generatedAt: meta.generatedAt ?? null,
      confirmedAt: meta.confirmedAt ?? null,
      durationMs: meta.durationMs ?? null,
      error: meta.error ?? null,
    };
  }
  return {
    schemaVersion: c.schemaVersion,
    currentJob: c.currentJob,
    jobs,
  };
}

/**
 * Allowlisted wizard DTO per job — no full FR / no sibling job payloads.
 */
function buildWizardJobDto(container, job) {
  const c = ensureAiAnalysisContainer(container);
  if (!isAiAnalysisUserJob(job)) {
    const err = new Error(`Unknown AI Analysis job: ${job}`);
    err.statusCode = 400;
    err.errorCode = 'AI_ANALYSIS_INVALID_JOB';
    throw err;
  }
  const meta = c.jobs[job];
  const map = AI_ANALYSIS_JOB_OUTPUT_MAP[job] || {};
  const dto = {
    job,
    status: meta.status,
    model: meta.model,
    generatedAt: meta.generatedAt,
    confirmedAt: meta.confirmedAt,
    durationMs: meta.durationMs ?? null,
    error: meta.error,
    schemaVersion: c.schemaVersion,
  };

  if (map.analyses) {
    dto.analyses = {};
    for (const key of map.analyses) {
      dto.analyses[key] = c.analyses[key];
    }
  }
  if (map.planning) {
    dto.planning = {};
    for (const key of map.planning) {
      dto.planning[key] = c.planning[key];
    }
  }
  if (map.resource) {
    dto.resource = {};
    for (const key of map.resource) {
      dto.resource[key] = c.resource[key];
    }
  }

  if (job === 'requirementAnalysis') {
    dto.preview = buildRequirementAnalysisGapPreview(c.analyses.gap);
  }

  return dto;
}

/**
 * Matching must not carry assignments; scheduleCapacity must not overwrite shortlist via edits.
 */
function assertMatchingAssignmentSeparation(job, edits) {
  if (!edits || typeof edits !== 'object') return;
  if (job === 'employeeMatching') {
    if (edits.assignments != null || edits.resource?.assignments != null) {
      const err = new Error(
        'employeeMatching cannot set assignments — use scheduleCapacity'
      );
      err.statusCode = 400;
      err.errorCode = 'AI_ANALYSIS_MATCHING_NO_ASSIGN';
      throw err;
    }
  }
  if (job === 'scheduleCapacity') {
    if (edits.recommendations != null || edits.fte != null || edits.resource?.recommendations != null) {
      const err = new Error(
        'scheduleCapacity cannot edit matching shortlist — confirm employeeMatching separately'
      );
      err.statusCode = 400;
      err.errorCode = 'AI_ANALYSIS_ASSIGN_NO_MATCHING_EDIT';
      throw err;
    }
  }
}

function applyJobEdits(container, job, edits) {
  assertMatchingAssignmentSeparation(job, edits);
  const next = ensureAiAnalysisContainer(container);
  if (!edits || typeof edits !== 'object') return next;

  const map = AI_ANALYSIS_JOB_OUTPUT_MAP[job] || {};
  if (map.analyses && edits.analyses && typeof edits.analyses === 'object') {
    for (const key of map.analyses) {
      if (edits.analyses[key] != null && typeof edits.analyses[key] === 'object') {
        next.analyses[key] = {
          ...next.analyses[key],
          ...edits.analyses[key],
          status: edits.analyses[key].status || next.analyses[key].status,
        };
      }
    }
  }
  if (map.planning && edits.planning && typeof edits.planning === 'object') {
    for (const key of map.planning) {
      if (Object.prototype.hasOwnProperty.call(edits.planning, key)) {
        next.planning[key] = edits.planning[key];
      }
    }
  }
  if (map.resource && edits.resource && typeof edits.resource === 'object') {
    for (const key of map.resource) {
      if (Object.prototype.hasOwnProperty.call(edits.resource, key)) {
        next.resource[key] = edits.resource[key];
      }
    }
  }
  return next;
}

/** Mark job ready with empty stub shells. */
function markJobReadyStub(container, job) {
  const next = markJobsStaleAfter(container, job);
  const now = new Date().toISOString();
  next.jobs[job] = {
    status: 'ready',
    model: null,
    generatedAt: now,
    confirmedAt: null,
    durationMs: next.jobs[job]?.durationMs ?? null,
    error: null,
  };
  next.currentJob = job;
  next.generatedAt = now;

  const map = AI_ANALYSIS_JOB_OUTPUT_MAP[job] || {};
  for (const key of map.analyses || []) {
    next.analyses[key] = {
      ...next.analyses[key],
      status: 'ready',
      generatedAt: now,
    };
  }
  return next;
}

function markJobConfirmed(container, job) {
  const next = ensureAiAnalysisContainer(container);
  const now = new Date().toISOString();
  next.jobs[job] = {
    ...next.jobs[job],
    status: 'confirmed',
    confirmedAt: now,
    error: null,
  };
  next.currentJob = job;
  return next;
}

module.exports = {
  createEmptyAiAnalysisContainer,
  ensureAiAnalysisContainer,
  emptyHierarchySection,
  assertSchemaVersionPresent,
  getJobStatus,
  assertPreviousJobConfirmed,
  assertJobNotConfirmedForRerun,
  packHasFeatureWithoutRequirement,
  capabilityItemsEmpty,
  normalizeEmptyCapabilityReady,
  assertCapabilityConfirmable,
  markJobsStaleAfter,
  summarizeAiAnalysis,
  buildWizardJobDto,
  assertMatchingAssignmentSeparation,
  applyJobEdits,
  markJobReadyStub,
  markJobConfirmed,
  AI_ANALYSIS_USER_JOBS,
  isAiAnalysisUserJob,
};
