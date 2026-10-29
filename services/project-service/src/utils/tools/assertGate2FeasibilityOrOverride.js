/**
 * Gate 2 — feasibility feasibility must pass, or forceApprove + overrideReason + audit (Track C).
 * Pure; no Mongo. Confidence on pack never substitutes for feasibility.pass.
 * Soft (HITL only): FEAS_RESOURCE, FEAS_SCHEDULE, AC_COVERAGE_GAP.
 */

const {
  migrateJobsProjectionToPhaseRuns,
} = require('../aiAnalysis/phaseGate2');
const { ensureAiAnalysisContainer } = require('../aiAnalysis/aiAnalysisContainer');
const {
  mergeQualityDeployIntoFeasibility,
} = require('../aiAnalysis/qualityDeployPlanGate');

/** Align with ai-project-planning-service checkFeasibility soft policy. */
const SOFT_G13_CODES = new Set(['FEAS_RESOURCE', 'FEAS_SCHEDULE', 'AC_COVERAGE_GAP']);

function isGate2FeasibilityEnforceEnabled(env = process.env) {
  const raw = String(env.GATE2_FEASIBILITY_ENFORCE ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function clipList(values, max = 8) {
  const list = (Array.isArray(values) ? values : []).map((v) => String(v || '').trim()).filter(Boolean);
  if (!list.length) return '';
  const head = list.slice(0, max);
  const more = list.length > max ? `…(+${list.length - max})` : '';
  return head.join(', ') + more;
}

/**
 * Human-readable G13 fail toast — codes + key ids, not a generic one-liner.
 * @param {{ failures?: array } | null} feasibility
 */
function formatG13FailedMessage(feasibility) {
  const rows = Array.isArray(feasibility?.failures) ? feasibility.failures : [];
  const hard = rows.filter((f) => {
    const code = String(f?.code || '');
    return code && !SOFT_G13_CODES.has(code) && f?.soft !== true;
  });
  const parts = (hard.length ? hard : rows).slice(0, 4).map((f) => {
    const code = String(f?.code || 'UNKNOWN');
    const detail = f?.detail && typeof f.detail === 'object' ? f.detail : {};
    const ids =
      clipList(detail.uncoveredFrIds) ||
      clipList(detail.uncoveredAcKeys) ||
      clipList(detail.uncoveredCriteria) ||
      clipList(detail.unresolvedStoryIds);
    const msg = String(f?.message || '').trim();
    if (ids) return `${code}: ${ids}`;
    if (msg) return `${code}: ${msg.slice(0, 120)}`;
    return code;
  });
  if (!parts.length) {
    return 'Feasibility chưa đạt — sửa plan / chạy lại HOW, hoặc forceApprove kèm lý do (audit).';
  }
  return `Feasibility chưa đạt — ${parts.join('; ')}. Sửa plan / chạy lại HOW, hoặc forceApprove kèm lý do.`;
}

/**
 * Soften soft G13 codes so legacy packs with pass:false only for those
 * codes no longer hard-block promote/confirm.
 * @param {{ pass?: boolean, failures?: array, softFailures?: array } | null} feasibility
 */
function applySoftResourceSchedulePolicy(feasibility) {
  if (!feasibility || typeof feasibility !== 'object') return feasibility;
  const failures = Array.isArray(feasibility.failures) ? feasibility.failures : [];
  const hard = [];
  const soft = [];
  for (const row of failures) {
    const code = String(row?.code || '');
    if (SOFT_G13_CODES.has(code)) {
      soft.push(row && row.soft === true ? row : { ...row, soft: true });
    } else {
      hard.push(row);
    }
  }
  const priorSoft = Array.isArray(feasibility.softFailures)
    ? feasibility.softFailures.filter((f) => SOFT_G13_CODES.has(String(f?.code || '')))
    : [];
  const softMerged = soft.length ? soft : priorSoft.map((f) => (f?.soft ? f : { ...f, soft: true }));
  return {
    ...feasibility,
    pass: hard.length === 0,
    failures: [...hard, ...softMerged],
    softFailures: softMerged,
  };
}

/**
 * Resolve feasibility result from pack.aiAnalysis after remote phase_how callback.
 * Step 8: also enforce Quality/Testing Plan + Deploy Plan structural DoD on pack.
 * @returns {{ pass: boolean, failures: array, source: string } | null}
 */
function resolveFeasibilityFromPack(pack) {
  const raw = pack?.aiAnalysis;
  const container = migrateJobsProjectionToPhaseRuns(
    ensureAiAnalysisContainer(raw && typeof raw === 'object' ? raw : {})
  );
  const packView = { aiAnalysis: container };
  const how = container?.phaseRuns?.phase_how || {};
  let base = null;
  const fromHow = how.feasibility;
  if (fromHow && typeof fromHow === 'object' && typeof fromHow.pass === 'boolean') {
    base = {
      pass: fromHow.pass === true,
      failures: Array.isArray(fromHow.failures) ? fromHow.failures : [],
      softFailures: Array.isArray(fromHow.softFailures) ? fromHow.softFailures : [],
      source: 'phaseRuns.phase_how.feasibility',
      evidenceRefs: Array.isArray(fromHow.evidenceRefs) ? fromHow.evidenceRefs : [],
    };
  } else {
    const fromAnalyses = container?.analyses?.g13Feasibility;
    if (
      fromAnalyses &&
      typeof fromAnalyses === 'object' &&
      typeof fromAnalyses.pass === 'boolean'
    ) {
      base = {
        pass: fromAnalyses.pass === true,
        failures: Array.isArray(fromAnalyses.failures) ? fromAnalyses.failures : [],
        softFailures: Array.isArray(fromAnalyses.softFailures)
          ? fromAnalyses.softFailures
          : [],
        source: 'analyses.g13Feasibility',
        evidenceRefs: Array.isArray(fromAnalyses.evidenceRefs)
          ? fromAnalyses.evidenceRefs
          : [],
      };
    }
  }

  const { feasibility: merged, gate } = mergeQualityDeployIntoFeasibility(base, packView);
  const {
    mergeWbsQualityCoverageIntoFeasibility,
  } = require('../aiAnalysis/wbsQualityCoverageGate');
  const { feasibility: withCoverage } = mergeWbsQualityCoverageIntoFeasibility(
    merged || base,
    packView
  );
  if (withCoverage) return applySoftResourceSchedulePolicy(withCoverage);
  // No feasibility payload yet — still block promote when HOW plans are structurally incomplete
  if (gate.enforce && gate.failures.length) {
    return applySoftResourceSchedulePolicy({
      pass: false,
      failures: gate.failures,
      source: 'pack.planning.quality_deploy',
      evidenceRefs: [],
      qualityPlanOk: gate.qualityPlanOk,
      deployPlanOk: gate.deployPlanOk,
      qualityDeployEnforced: true,
    });
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
    // Legacy packs without feasibility payload — allow unless require-strict
    const requirePresent =
      String(env.GATE2_FEASIBILITY_REQUIRE ?? '0').trim().toLowerCase() === '1' ||
      String(env.GATE2_FEASIBILITY_REQUIRE ?? '').trim().toLowerCase() === 'true';
    if (!requirePresent) {
      return { ok: true, feasibility: null, override: null, legacyMissing: true };
    }
    if (forced) {
      if (!reason) {
        const err = new Error(
          'feasibility feasibility chưa có — cần overrideReason khi forceApprove'
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
      'Chưa có feasibility feasibility trên phase_how. Chạy Phase 2 HOW lại, hoặc forceApprove kèm lý do.'
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
        'overrideReason bắt buộc khi forceApprove khi feasibility feasibility fail'
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

  const err = new Error(formatG13FailedMessage(feasibility));
  err.statusCode = 409;
  err.errorCode = 'G13_FEASIBILITY_FAILED';
  err.details = {
    feasibility: {
      pass: false,
      failures: feasibility.failures,
      softFailures: feasibility.softFailures || [],
      source: feasibility.source,
    },
  };
  throw err;
}

module.exports = {
  assertGate2FeasibilityOrOverride,
  resolveFeasibilityFromPack,
  isGate2FeasibilityEnforceEnabled,
  applySoftResourceSchedulePolicy,
  formatG13FailedMessage,
  SOFT_G13_CODES,
};
