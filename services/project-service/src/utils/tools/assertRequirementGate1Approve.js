/**
 * Gate 1 approve — Gate A is advisory by default (does not block).
 * Set GATE_A_ENFORCE=1 to restore hard Gate A fail / missing behavior.
 * Pure; no Mongo.
 */

function isRequirementGate1Enabled() {
  const raw = String(process.env.REQUIREMENT_GATE1 || '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/** Rollback: hard-enforce Gate A quality on approve. Default off (advisory). */
function isGateAEnforceEnabled() {
  const raw = String(process.env.GATE_A_ENFORCE || '0').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

/**
 * Resolve gateA from pack / requirementTools shell.
 * Strips sheet-empty missing_sections so stale snapshots do not warn/enforce.
 * @returns {{ passed: boolean, checks: array, source: string } | null}
 */
function resolveGateAFromPack(pack) {
  const { sanitizeGateAForSourceAbsence } = require('./gateAAdvisorySignals');
  const tools =
    pack?.aiAnalysis?.analyses?.requirementTools ||
    pack?.analyses?.requirementTools ||
    null;
  const gateA = tools?.gateA;
  if (gateA && typeof gateA === 'object') {
    const cleaned = sanitizeGateAForSourceAbsence(gateA);
    return {
      passed: Boolean(cleaned.passed),
      checks: Array.isArray(cleaned.checks) ? cleaned.checks : [],
      source: 'requirementTools.gateA',
      thresholds: cleaned.thresholds || gateA.thresholds || null,
      hasWarnings: cleaned.hasWarnings,
    };
  }
  const factPassed = tools?.facts?.['gateA.passed'];
  if (factPassed !== undefined && factPassed !== null) {
    return {
      passed: Boolean(factPassed),
      checks: [],
      source: 'facts.gateA.passed',
    };
  }
  return null;
}

function isAiRequirementPack(pack) {
  const phase = pack?.aiAnalysis?.phaseRuns?.phase_what || pack?.phaseRuns?.phase_what;
  if (phase && (phase.mode === 'requirement' || phase.status === 'ready')) return true;
  const analyses = pack?.aiAnalysis?.analyses || pack?.analyses || {};
  if (analyses.srsProposal?.generated?.functionalRequirements?.items?.length) return true;
  const mode = String(pack?.analysisMode || pack?.aiAnalysisMode || '').toLowerCase();
  return mode === 'ai';
}

/**
 * AI requirement path: require srsProposal FR (unless force).
 */
function assertRequirementReadyForGate1({ pack, forceApprove = false, overrideReason = '' } = {}) {
  let hasReadySrsProposal = () => false;
  try {
    ({ hasReadySrsProposal } = require('../aiAnalysis/whatRequirementPolicy'));
  } catch {
    /* optional */
  }
  if (!isAiRequirementPack(pack)) {
    return { ok: true, skipped: true, reason: 'not_requirement_pack' };
  }

  if (hasReadySrsProposal(pack)) {
    return { ok: true, requirementReady: true };
  }

  const forced = forceApprove === true || forceApprove === 'true' || forceApprove === 1;
  const reason = String(overrideReason || '').trim().slice(0, 2000);
  if (forced) {
    if (!reason) {
      const err = new Error('AI Requirement (srsProposal) chưa sẵn — cần overrideReason khi forceApprove');
      err.statusCode = 400;
      err.errorCode = 'REQUIREMENT_OVERRIDE_REASON_REQUIRED';
      throw err;
    }
    return {
      ok: true,
      override: { forceApprove: true, reason, missingRequirementProposal: true },
    };
  }
  const err = new Error(
    'Chưa có AI Requirement (srsProposal). Chạy Phase 1 WHAT trước khi duyệt, hoặc forceApprove kèm lý do.'
  );
  err.statusCode = 409;
  err.errorCode = 'REQUIREMENT_PROPOSAL_MISSING';
  throw err;
}

/**
 * @param {{ pack: object, forceApprove?: boolean, overrideReason?: string }} args
 * @returns {{ ok: true, gateA: object|null, override: object|null } | never throws}
 */
function assertRequirementGate1Approve({
  pack,
  forceApprove = false,
  overrideReason = '',
} = {}) {
  if (!isRequirementGate1Enabled()) {
    return { ok: true, gateA: resolveGateAFromPack(pack), override: null, skipped: true };
  }

  const requirementGate = assertRequirementReadyForGate1({
    pack,
    forceApprove,
    overrideReason,
  });

  const {
    assertGate1ConflictAmbiguityOrOverride,
  } = require('./assertGate1ConflictAmbiguityOrOverride');
  const conflictGate = assertGate1ConflictAmbiguityOrOverride({
    pack,
    forceApprove,
    overrideReason,
  });

  const gateA = resolveGateAFromPack(pack);
  const forced = forceApprove === true || forceApprove === 'true' || forceApprove === 1;
  const reason = String(overrideReason || '').trim().slice(0, 2000);
  const enforce = isGateAEnforceEnabled();

  // Advisory default: Gate A quality never blocks approve (warnings only on FE).
  if (!enforce) {
    return {
      ok: true,
      gateA,
      override: conflictGate.override || null,
      requirementReady: Boolean(requirementGate.requirementReady),
      conflictAmbiguity: conflictGate.gate || null,
      gateAAdvisory: true,
      gateAHasWarnings: Boolean(
        gateA &&
          (gateA.hasWarnings === true ||
            gateA.passed === false ||
            (Array.isArray(gateA.checks) &&
              gateA.checks.some((c) => c && !c.skipped && c.passed === false)))
      ),
    };
  }

  // Requirement AI path may not have classic GateA tools yet — allow when proposal ready
  if (
    !gateA &&
    requirementGate.requirementReady &&
    !requirementGate.override?.missingRequirementProposal
  ) {
    return {
      ok: true,
      gateA: null,
      override: conflictGate.override || null,
      requirementReady: true,
      conflictAmbiguity: conflictGate.gate || null,
    };
  }

  if (!gateA) {
    if (forced) {
      if (!reason) {
        const err = new Error(
          'Gate A chưa có kết quả — cần overrideReason khi forceApprove'
        );
        err.statusCode = 400;
        err.errorCode = 'GATE_A_OVERRIDE_REASON_REQUIRED';
        throw err;
      }
      return {
        ok: true,
        gateA: null,
        override: {
          forceApprove: true,
          reason,
          missingGateA: true,
          ...(requirementGate.override || {}),
          ...(conflictGate.override
            ? { conflictAmbiguity: conflictGate.override }
            : {}),
        },
        conflictAmbiguity: conflictGate.gate || null,
      };
    }
    const err = new Error(
      'Chưa có Gate A (requirement tools). Chạy AI snapshot/recipe trước khi duyệt, hoặc forceApprove kèm lý do.'
    );
    err.statusCode = 409;
    err.errorCode = 'GATE_A_MISSING';
    err.details = { gateA: null };
    throw err;
  }

  if (gateA.passed === true) {
    return {
      ok: true,
      gateA,
      override: conflictGate.override || null,
      requirementReady: Boolean(requirementGate.requirementReady),
      conflictAmbiguity: conflictGate.gate || null,
    };
  }

  if (forced) {
    if (!reason) {
      const err = new Error('overrideReason bắt buộc khi forceApprove khi Gate A fail');
      err.statusCode = 400;
      err.errorCode = 'GATE_A_OVERRIDE_REASON_REQUIRED';
      throw err;
    }
    return {
      ok: true,
      gateA,
      override: {
        forceApprove: true,
        reason,
        missingGateA: false,
        ...(requirementGate.override || {}),
        ...(conflictGate.override
          ? { conflictAmbiguity: conflictGate.override }
          : {}),
      },
      requirementReady: Boolean(requirementGate.requirementReady),
      conflictAmbiguity: conflictGate.gate || null,
    };
  }

  const failedChecks = (gateA.checks || []).filter((c) => c && c.passed === false);
  const missCheck = failedChecks.find((c) => c?.id === 'missing_sections');
  const missMsg =
    (missCheck && typeof missCheck.message === 'string' && missCheck.message.trim()) ||
    '';
  const err = new Error(
    missMsg
      ? `Gate A chưa đạt — ${missMsg}. Sửa pack/chạy lại tools, hoặc forceApprove kèm lý do.`
      : 'Gate A (requirement quality) chưa đạt — sửa pack/chạy lại tools, hoặc forceApprove kèm lý do.'
  );
  err.statusCode = 409;
  err.errorCode = 'GATE_A_FAILED';
  err.details = {
    gateA: {
      passed: false,
      checks: gateA.checks,
      failedChecks,
      source: gateA.source,
    },
  };
  throw err;
}

module.exports = {
  isRequirementGate1Enabled,
  isGateAEnforceEnabled,
  resolveGateAFromPack,
  assertRequirementGate1Approve,
  assertRequirementReadyForGate1,
  isAiRequirementPack,
};
