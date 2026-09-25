/**
 * Gate 1 — Conflict/Ambiguity must be clear (or forceApprove + overrideReason).
 * Track A. Pure; no Mongo.
 */

/**
 * @param {object} pack
 * @returns {{ passed: boolean, blocking: array, source: string } | null}
 */
function resolveConflictAmbiguityFromPack(pack) {
  const analyses = pack?.aiAnalysis?.analyses || pack?.analyses || {};
  const g4 = analyses.g4Understanding;
  const fromG4 = g4?.conflictAmbiguityGate || g4?.meta?.conflictAmbiguityGate;
  if (fromG4 && typeof fromG4 === 'object' && typeof fromG4.passed === 'boolean') {
    return {
      passed: fromG4.passed === true,
      blocking: Array.isArray(fromG4.blocking) ? fromG4.blocking : [],
      ambiguities: Array.isArray(fromG4.ambiguities) ? fromG4.ambiguities : [],
      conflicts: Array.isArray(fromG4.conflicts) ? fromG4.conflicts : [],
      source: 'analyses.g4Understanding.conflictAmbiguityGate',
    };
  }

  const phaseWhat =
    pack?.aiAnalysis?.phaseRuns?.phase_what || pack?.phaseRuns?.phase_what || {};
  const fromPhase = phaseWhat.conflictAmbiguityGate;
  if (fromPhase && typeof fromPhase === 'object' && typeof fromPhase.passed === 'boolean') {
    return {
      passed: fromPhase.passed === true,
      blocking: Array.isArray(fromPhase.blocking) ? fromPhase.blocking : [],
      ambiguities: Array.isArray(fromPhase.ambiguities) ? fromPhase.ambiguities : [],
      conflicts: Array.isArray(fromPhase.conflicts) ? fromPhase.conflicts : [],
      source: 'phaseRuns.phase_what.conflictAmbiguityGate',
    };
  }

  // Derive lightly from raw g4 arrays if gate object missing (legacy)
  if (g4 && typeof g4 === 'object') {
    const ambiguities = Array.isArray(g4.ambiguities) ? g4.ambiguities : [];
    const rejected = Array.isArray(g4.rejectedRelationships)
      ? g4.rejectedRelationships
      : [];
    const conflicts = rejected.filter(
      (r) =>
        r.validationError === 'REL_CIRCULAR' ||
        r.validationError === 'REL_TARGET_MISSING'
    );
    if (ambiguities.length || conflicts.length) {
      const blocking = [
        ...ambiguities.map((a) => ({ ...a, blockKind: 'ambiguity' })),
        ...conflicts.map((c) => ({ ...c, blockKind: 'conflict' })),
      ];
      return {
        passed: false,
        blocking,
        ambiguities,
        conflicts,
        source: 'derived_g4_arrays',
      };
    }
    // G4 present with no issues
    if (Array.isArray(g4.requirements) || g4.meta) {
      return {
        passed: true,
        blocking: [],
        ambiguities: [],
        conflicts: [],
        source: 'derived_g4_clean',
      };
    }
  }

  return null;
}

function isGate1ConflictAmbiguityEnforceEnabled(env = process.env) {
  const raw = String(env.GATE1_CONFLICT_AMBIGUITY_ENFORCE ?? '1')
    .trim()
    .toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * @param {{
 *   pack: object,
 *   forceApprove?: boolean,
 *   overrideReason?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} args
 */
function assertGate1ConflictAmbiguityOrOverride({
  pack,
  forceApprove = false,
  overrideReason = '',
  env = process.env,
} = {}) {
  if (!isGate1ConflictAmbiguityEnforceEnabled(env)) {
    return {
      ok: true,
      gate: resolveConflictAmbiguityFromPack(pack),
      override: null,
      skipped: true,
    };
  }

  const gate = resolveConflictAmbiguityFromPack(pack);
  const forced = forceApprove === true || forceApprove === 'true' || forceApprove === 1;
  const reason = String(overrideReason || '').trim().slice(0, 2000);

  if (!gate) {
    // No Phase1 G4 yet — leave to existing G4/GateA asserts; do not double-block
    return { ok: true, gate: null, override: null, missing: true };
  }

  if (gate.passed === true) {
    return { ok: true, gate, override: null };
  }

  if (forced) {
    if (!reason) {
      const err = new Error(
        'overrideReason bắt buộc khi forceApprove khi còn conflict/ambiguity'
      );
      err.statusCode = 400;
      err.errorCode = 'CONFLICT_AMBIGUITY_OVERRIDE_REASON_REQUIRED';
      throw err;
    }
    return {
      ok: true,
      gate,
      override: {
        forceApprove: true,
        reason,
        blockingCount: gate.blocking.length,
        blocking: gate.blocking.slice(0, 20),
      },
    };
  }

  const err = new Error(
    'Còn conflict/ambiguity chưa xử lý — làm rõ SRS hoặc forceApprove kèm lý do trước Gate 1.'
  );
  err.statusCode = 409;
  err.errorCode = 'CONFLICT_AMBIGUITY_BLOCKING';
  err.details = {
    gate: {
      passed: false,
      blocking: gate.blocking.slice(0, 30),
      source: gate.source,
    },
  };
  throw err;
}

module.exports = {
  assertGate1ConflictAmbiguityOrOverride,
  resolveConflictAmbiguityFromPack,
  isGate1ConflictAmbiguityEnforceEnabled,
};
