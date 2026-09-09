/**
 * Migrate pack.aiAnalysis jobs meta from schema v1 (6 jobs) → v2 (10+ jobs)
 * and insert hierarchyDecomposition when missing.
 */

const { AI_ANALYSIS_SCHEMA_VERSION } = require('../../constants/aiAnalysisJobs.constants');
const { listRequirementRows } = require('../requirement/requirementFrLevel');

function copyJobMeta(src) {
  if (!src || typeof src !== 'object') return null;
  return {
    status: String(src.status || 'empty'),
    model: src.model ?? null,
    generatedAt: src.generatedAt ?? null,
    confirmedAt: src.confirmedAt ?? null,
    durationMs: src.durationMs ?? null,
    error: src.error ?? null,
  };
}

function asStale(meta) {
  if (!meta) return null;
  const st = String(meta.status || 'empty');
  if (st === 'empty') return meta;
  return { ...meta, status: 'stale', error: null };
}

/**
 * Mutates/returns jobs object with v2 keys filled from v1 where possible.
 * @param {object} rawJobs
 * @returns {{ jobs: object, migrated: boolean }}
 */
function migrateAiAnalysisJobsV1ToV2(rawJobs = {}) {
  const src = rawJobs && typeof rawJobs === 'object' ? rawJobs : {};
  const out = { ...src };
  let migrated = false;

  const wbs = copyJobMeta(src.wbsGeneration);
  const arch = copyJobMeta(src.architectureRiskAnalysis);
  const role = copyJobMeta(src.roleSkillAnalysis);
  const assign = copyJobMeta(src.employeeAssignment);

  // Capability was embedded in wbsGeneration — copy meta; downstream must re-confirm if shape split.
  if (!out.capabilityAnalysis?.status || out.capabilityAnalysis.status === 'empty') {
    if (wbs && wbs.status !== 'empty') {
      out.capabilityAnalysis = asStale(wbs) || wbs;
      migrated = true;
    }
  }

  // Dependency was embedded in architectureRiskAnalysis.
  if (!out.dependencyAnalysis?.status || out.dependencyAnalysis.status === 'empty') {
    if (arch && arch.status !== 'empty') {
      out.dependencyAnalysis = asStale(arch) || arch;
      migrated = true;
    }
  }

  if (arch && arch.status === 'confirmed') {
    out.architectureRiskAnalysis = asStale(arch);
    migrated = true;
  }

  if (!out.effortRoleAnalysis?.status || out.effortRoleAnalysis.status === 'empty') {
    if (role && role.status !== 'empty') {
      out.effortRoleAnalysis = asStale(role) || role;
      migrated = true;
    }
  }

  if (!out.scheduleCapacity?.status || out.scheduleCapacity.status === 'empty') {
    if (assign && assign.status !== 'empty') {
      out.scheduleCapacity = asStale(assign) || assign;
      migrated = true;
    }
  }

  // New engines — mark stale if prior pipeline past matching so user re-runs.
  const matching = copyJobMeta(src.employeeMatching);
  if (matching && matching.status !== 'empty') {
    if (!out.sequencingCpm?.status || out.sequencingCpm.status === 'empty') {
      out.sequencingCpm = { ...matching, status: 'stale', error: null };
      migrated = true;
    }
    if (!out.projectPlan?.status || out.projectPlan.status === 'empty') {
      out.projectPlan = {
        status: 'stale',
        model: null,
        generatedAt: null,
        confirmedAt: null,
        durationMs: null,
        error: null,
      };
      migrated = true;
    }
  }

  return { jobs: out, migrated };
}

function needsJobMigration(raw) {
  if (!raw || typeof raw !== 'object') return false;
  const v = Number(raw.schemaVersion);
  if (Number.isFinite(v) && v >= AI_ANALYSIS_SCHEMA_VERSION) return false;
  const jobs = raw.jobs || {};
  return Boolean(
    jobs.roleSkillAnalysis ||
      jobs.employeeAssignment ||
      (jobs.wbsGeneration && !jobs.capabilityAnalysis) ||
      v === 1 ||
      !Number.isFinite(v)
  );
}

function emptyHierarchyShellForMigrate() {
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

/**
 * Insert / finalize hierarchyDecomposition when the job was missing before ensure.
 * @param {object} container — already ensured
 * @param {object[]} frList
 * @param {{ jobWasMissing?: boolean }} [opts]
 * @returns {{ container: object, changed: boolean }}
 */
function ensureHierarchyDecompositionMigrated(container, frList, opts = {}) {
  const jobWasMissing = opts.jobWasMissing === true;
  if (!jobWasMissing || !container || typeof container !== 'object') {
    return { container, changed: false };
  }

  const next = {
    ...container,
    jobs: { ...(container.jobs || {}) },
    analyses: { ...(container.analyses || {}) },
  };

  const hasRequirementLeaves = listRequirementRows(frList || []).length >= 1;
  if (hasRequirementLeaves) {
    const now = new Date().toISOString();
    next.jobs.hierarchyDecomposition = {
      status: 'confirmed',
      model: null,
      generatedAt: now,
      confirmedAt: now,
      durationMs: null,
      error: null,
    };
    const hierarchy = emptyHierarchyShellForMigrate();
    hierarchy.status = 'confirmed';
    hierarchy.generatedAt = now;
    hierarchy.meta = {
      ...hierarchy.meta,
      migratedSkip: true,
    };
    next.analyses.hierarchy = hierarchy;
    return { container: next, changed: true };
  }

  // Leave status empty; persist so the new job key is stored.
  if (!next.jobs.hierarchyDecomposition) {
    next.jobs.hierarchyDecomposition = {
      status: 'empty',
      model: null,
      generatedAt: null,
      confirmedAt: null,
      durationMs: null,
      error: null,
    };
  }
  if (!next.analyses.hierarchy) {
    next.analyses.hierarchy = emptyHierarchyShellForMigrate();
  }
  return { container: next, changed: true };
}

module.exports = {
  migrateAiAnalysisJobsV1ToV2,
  needsJobMigration,
  ensureHierarchyDecompositionMigrated,
  copyJobMeta,
};
