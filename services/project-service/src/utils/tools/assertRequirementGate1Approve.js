/**
 * Gate 1 — human approve must respect Gate A tool quality (or forceApprove + audit).
 * Pure; no Mongo.
 */

function isRequirementGate1Enabled() {
  const raw = String(process.env.REQUIREMENT_GATE1 || '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * Resolve gateA from pack / requirementTools shell.
 * @returns {{ passed: boolean, checks: array, source: string } | null}
 */
function resolveGateAFromPack(pack) {
  const tools =
    pack?.aiAnalysis?.analyses?.requirementTools ||
    pack?.analyses?.requirementTools ||
    null;
  const gateA = tools?.gateA;
  if (gateA && typeof gateA === 'object') {
    return {
      passed: Boolean(gateA.passed),
      checks: Array.isArray(gateA.checks) ? gateA.checks : [],
      source: 'requirementTools.gateA',
      thresholds: gateA.thresholds || null,
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

function isAiWhatG4Pack(pack) {
  const phase = pack?.aiAnalysis?.phaseRuns?.phase_what || pack?.phaseRuns?.phase_what;
  if (phase && (phase.mode === 'g4' || phase.status === 'ready')) return true;
  const g4 =
    pack?.aiAnalysis?.analyses?.g4Understanding || pack?.analyses?.g4Understanding;
  if (g4 && typeof g4 === 'object') return true;
  const mode = String(pack?.analysisMode || pack?.aiAnalysisMode || '').toLowerCase();
  return mode === 'ai';
}

/**
 * When WHAT_G4 is on and pack is AI G4 path, require g4Understanding (unless force).
 */
function assertG4ReadyForGate1({ pack, forceApprove = false, overrideReason = '' } = {}) {
  let isWhatG4Enabled = () => true;
  let hasReadyG4Understanding = () => false;
  try {
    ({ isWhatG4Enabled, hasReadyG4Understanding } = require('../aiAnalysis/whatG4Policy'));
  } catch {
    /* optional */
  }
  if (!isWhatG4Enabled()) return { ok: true, skipped: true };
  if (!isAiWhatG4Pack(pack)) return { ok: true, skipped: true, reason: 'not_g4_pack' };

  if (hasReadyG4Understanding(pack)) {
    return { ok: true, g4: true };
  }

  const forced = forceApprove === true || forceApprove === 'true' || forceApprove === 1;
  const reason = String(overrideReason || '').trim().slice(0, 2000);
  if (forced) {
    if (!reason) {
      const err = new Error('G4 Understanding chưa sẵn — cần overrideReason khi forceApprove');
      err.statusCode = 400;
      err.errorCode = 'G4_OVERRIDE_REASON_REQUIRED';
      throw err;
    }
    return { ok: true, override: { forceApprove: true, reason, missingG4: true } };
  }
  const err = new Error(
    'Chưa có G4 Understanding. Chạy Phase 1 G4 (prepare → G4) trước khi duyệt, hoặc forceApprove kèm lý do.'
  );
  err.statusCode = 409;
  err.errorCode = 'G4_UNDERSTANDING_MISSING';
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

  const g4Gate = assertG4ReadyForGate1({ pack, forceApprove, overrideReason });

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

  // G4-only AI path may not have classic GateA tools yet — allow when G4 ready
  if (!gateA && g4Gate.g4 && !g4Gate.override?.missingG4) {
    return {
      ok: true,
      gateA: null,
      override: conflictGate.override || null,
      g4: true,
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
          ...(g4Gate.override || {}),
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
      g4: Boolean(g4Gate.g4),
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
        ...(g4Gate.override || {}),
        ...(conflictGate.override
          ? { conflictAmbiguity: conflictGate.override }
          : {}),
      },
      g4: Boolean(g4Gate.g4),
      conflictAmbiguity: conflictGate.gate || null,
    };
  }

  const failedChecks = (gateA.checks || []).filter((c) => c && c.passed === false);
  const err = new Error(
    'Gate A (requirement quality) chưa đạt — sửa pack/chạy lại tools, hoặc forceApprove kèm lý do.'
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
  resolveGateAFromPack,
  assertRequirementGate1Approve,
  assertG4ReadyForGate1,
  isAiWhatG4Pack,
};
