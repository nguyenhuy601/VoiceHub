/**
 * Gate 2 — G13 feasibility must pass, or forceApprove + overrideReason + audit (Track C).
 * Pure; no Mongo. Confidence on pack never substitutes for feasibility.pass.
 */

const {
  migrateJobsProjectionToPhaseRuns,
} = require('../aiAnalysis/phaseGate2');
const { ensureAiAnalysisContainer } = require('../aiAnalysis/aiAnalysisContainer');

function isGate2FeasibilityEnforceEnabled(env = process.env) {
  const raw = String(env.GATE2_FEASIBILITY_ENFORCE ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * Resolve G13 result from pack.aiAnalysis after remote phase_how callback.
 * @returns {{ pass: boolean, failures: array, source: string } | null}
 */
function resolveFeasibilityFromPack(pack) {
  const raw = pack?.aiAnalysis;
  const container = migrateJobsProjectionToPhaseRuns(
    ensureAiAnalysisContainer(raw && typeof raw === 'object' ? raw : {})
  );
  const how = container?.phaseRuns?.phase_how || {};
  const fromHow = how.feasibility;
  if (fromHow && typeof fromHow === 'object' && typeof fromHow.pass === 'boolean') {
    return {
      pass: fromHow.pass === true,
      failures: Array.isArray(fromHow.failures) ? fromHow.failures : [],
      source: 'phaseRuns.phase_how.feasibility',
      evidenceRefs: Array.isArray(fromHow.evidenceRefs) ? fromHow.evidenceRefs : [],
    };
  }
  const fromAnalyses = container?.analyses?.g13Feasibility;
  if (
    fromAnalyses &&
    typeof fromAnalyses === 'object' &&
    typeof fromAnalyses.pass === 'boolean'
  ) {
    return {
      pass: fromAnalyses.pass === true,
      failures: Array.isArray(fromAnalyses.failures) ? fromAnalyses.failures : [],
      source: 'analyses.g13Feasibility',
      evidenceRefs: Array.isArray(fromAnalyses.evidenceRefs)
        ? fromAnalyses.evidenceRefs
        : [],
    };
  }
  return null;
}

/**
 * @param {{
 *   pack: object,
 *   forceApprove?: boolean,
 *   overrideReason?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} args
 * @returns {{ ok: true, feasibility: object|null, override: object|null }}
 */
function assertGate2FeasibilityOrOverride({
  pack,
  forceApprove = false,
  overrideReason = '',
  env = process.env,
} = {}) {
  if (!isGate2FeasibilityEnforceEnabled(env)) {
    return {
      ok: true,
      feasibility: resolveFeasibilityFromPack(pack),
      override: null,
      skipped: true,
    };
  }

  const feasibility = resolveFeasibilityFromPack(pack);
  const forced = forceApprove === true || forceApprove === 'true' || forceApprove === 1;
  const reason = String(overrideReason || '').trim().slice(0, 2000);

  if (!feasibility) {
    // Legacy packs without G13 payload — allow unless require-strict
    const requirePresent =
      String(env.GATE2_FEASIBILITY_REQUIRE ?? '0').trim().toLowerCase() === '1' ||
      String(env.GATE2_FEASIBILITY_REQUIRE ?? '').trim().toLowerCase() === 'true';
    if (!requirePresent) {
      return { ok: true, feasibility: null, override: null, legacyMissing: true };
    }
    if (forced) {
      if (!reason) {
        const err = new Error(
          'G13 feasibility chưa có — cần overrideReason khi forceApprove'
        );
        err.statusCode = 400;
        err.errorCode = 'G13_OVERRIDE_REASON_REQUIRED';
        throw err;
      }
      return {
        ok: true,
        feasibility: null,
        override: {
          forceApprove: true,
          reason,
          missingFeasibility: true,
        },
      };
    }
    const err = new Error(
      'Chưa có G13 feasibility trên phase_how. Chạy Phase 2 HOW lại, hoặc forceApprove kèm lý do.'
    );
    err.statusCode = 409;
    err.errorCode = 'G13_FEASIBILITY_MISSING';
    throw err;
  }

  if (feasibility.pass === true) {
    return { ok: true, feasibility, override: null };
  }

  if (forced) {
    if (!reason) {
      const err = new Error(
        'overrideReason bắt buộc khi forceApprove khi G13 feasibility fail'
      );
      err.statusCode = 400;
      err.errorCode = 'G13_OVERRIDE_REASON_REQUIRED';
      throw err;
    }
    return {
      ok: true,
      feasibility,
      override: {
        forceApprove: true,
        reason,
        missingFeasibility: false,
        failures: feasibility.failures,
      },
    };
  }

  const err = new Error(
    'G13 feasibility chưa đạt — sửa plan / chạy lại HOW, hoặc forceApprove kèm lý do (audit).'
  );
  err.statusCode = 409;
  err.errorCode = 'G13_FEASIBILITY_FAILED';
  err.details = {
    feasibility: {
      pass: false,
      failures: feasibility.failures,
      source: feasibility.source,
    },
  };
  throw err;
}

module.exports = {
  assertGate2FeasibilityOrOverride,
  resolveFeasibilityFromPack,
  isGate2FeasibilityEnforceEnabled,
};
