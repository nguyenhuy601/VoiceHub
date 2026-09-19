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

  const gateA = resolveGateAFromPack(pack);
  const forced = forceApprove === true || forceApprove === 'true' || forceApprove === 1;
  const reason = String(overrideReason || '').trim().slice(0, 2000);

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
        },
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
    return { ok: true, gateA, override: null };
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
      },
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
};
