/**
 * Gate 1 — Requirement Integrity Gate enforce (RULE-RIG).
 * Hard-block only; warnings (e.g. REL_EVIDENCE_REQUIRED) do not 409.
 * Legacy export names / errorCodes kept for compat wave.
 */

const HARD_BLOCK_KINDS = new Set(['data_integrity', 'relationship_integrity']);
const LEGACY_BLOCK_KINDS = new Set(['ambiguity', 'conflict']);
const HARD_REL_CODES = new Set([
  'REL_CIRCULAR',
  'REL_TARGET_MISSING',
  'REL_MISSING_ENDPOINT',
]);

function isHardBlockingItem(item) {
  if (!item || typeof item !== 'object') return false;
  const blockKind = String(item.blockKind || '');
  if (HARD_BLOCK_KINDS.has(blockKind)) return true;
  if (blockKind === 'ambiguity') {
    // Legacy: only incomplete_fields is integrity; vague semantic was mislabeled
    const kind = String(item.kind || 'incomplete_fields');
    return kind === 'incomplete_fields' || kind === 'ambiguity' || !item.kind;
  }
  if (blockKind === 'conflict') {
    const code = String(item.code || '');
    if (code === 'REL_EVIDENCE_REQUIRED') return false;
    return !code || HARD_REL_CODES.has(code) || Boolean(item.kind);
  }
  // Untyped legacy row with incomplete_fields
  if (String(item.kind || '') === 'incomplete_fields') return true;
  if (HARD_REL_CODES.has(String(item.code || ''))) return true;
  return false;
}

function normalizeGateShape(raw, source) {
  if (!raw || typeof raw !== 'object' || typeof raw.passed !== 'boolean') {
    return null;
  }
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings
    : Array.isArray(raw.findings)
      ? raw.findings
      : [];
  const rawBlocking = Array.isArray(raw.blocking) ? raw.blocking : [];
  const blocking = rawBlocking.filter(isHardBlockingItem);
  // Prefer recomputed pass from hard blocking (B2: ignore evidence warnings)
  const passed = blocking.length === 0;
  return {
    passed,
    blocking,
    warnings,
    ambiguities: Array.isArray(raw.ambiguities) ? raw.ambiguities : [],
    conflicts: Array.isArray(raw.conflicts) ? raw.conflicts : [],
    source,
    gateKind: raw.gateKind || 'requirement_integrity',
  };
}

/**
 * @param {object} pack
 * @returns {{ passed: boolean, blocking: array, source: string } | null}
 */
function resolveConflictAmbiguityFromPack(pack) {
  const analyses = pack?.aiAnalysis?.analyses || pack?.analyses || {};
  const g4 = analyses.g4Understanding;

  const fromG4 =
    g4?.requirementIntegrityGate ||
    g4?.conflictAmbiguityGate ||
    g4?.meta?.requirementIntegrityGate ||
    g4?.meta?.conflictAmbiguityGate;
  const normalizedG4 = normalizeGateShape(
    fromG4,
    g4?.requirementIntegrityGate
      ? 'analyses.g4Understanding.requirementIntegrityGate'
      : 'analyses.g4Understanding.conflictAmbiguityGate'
  );
  if (normalizedG4) return normalizedG4;

  const phaseWhat =
    pack?.aiAnalysis?.phaseRuns?.phase_what || pack?.phaseRuns?.phase_what || {};
  const fromPhase =
    phaseWhat.requirementIntegrityGate || phaseWhat.conflictAmbiguityGate;
  const normalizedPhase = normalizeGateShape(
    fromPhase,
    phaseWhat.requirementIntegrityGate
      ? 'phaseRuns.phase_what.requirementIntegrityGate'
      : 'phaseRuns.phase_what.conflictAmbiguityGate'
  );
  if (normalizedPhase) return normalizedPhase;

  // Derive lightly from raw g4 arrays if gate object missing (legacy)
  if (g4 && typeof g4 === 'object') {
    const ambiguities = Array.isArray(g4.ambiguities) ? g4.ambiguities : [];
    const rejected = Array.isArray(g4.rejectedRelationships)
      ? g4.rejectedRelationships
      : [];
    const dataIssues = ambiguities.filter(
      (a) => String(a?.kind || '') === 'incomplete_fields' || !a?.kind
    );
    const conflicts = rejected.filter((r) =>
      HARD_REL_CODES.has(String(r.validationError || r.code || ''))
    );
    if (dataIssues.length || conflicts.length) {
      const blocking = [
        ...dataIssues.map((a) => ({
          ...a,
          blockKind: 'data_integrity',
          kind: a.kind || 'incomplete_fields',
        })),
        ...conflicts.map((c) => ({
          ...c,
          blockKind: 'relationship_integrity',
          code: c.validationError || c.code,
        })),
      ];
      return {
        passed: false,
        blocking,
        warnings: [],
        ambiguities: dataIssues,
        conflicts,
        source: 'derived_g4_arrays',
        gateKind: 'requirement_integrity',
      };
    }
    if (Array.isArray(g4.requirements) || g4.meta) {
      return {
        passed: true,
        blocking: [],
        warnings: [],
        ambiguities: [],
        conflicts: [],
        source: 'derived_g4_clean',
        gateKind: 'requirement_integrity',
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
    return { ok: true, gate: null, override: null, missing: true };
  }

  if (gate.passed === true) {
    return { ok: true, gate, override: null };
  }

  if (forced) {
    if (!reason) {
      const err = new Error(
        'overrideReason bắt buộc khi forceApprove khi còn lỗi Requirement Integrity'
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
    'Requirement Integrity Gate: còn lỗi cấu trúc (missing fields / relationship) — bổ sung dữ liệu hoặc forceApprove kèm lý do trước Gate 1.'
  );
  err.statusCode = 409;
  err.errorCode = 'CONFLICT_AMBIGUITY_BLOCKING';
  err.details = {
    gate: {
      passed: false,
      blocking: gate.blocking.slice(0, 30),
      warnings: Array.isArray(gate.warnings) ? gate.warnings.slice(0, 20) : [],
      source: gate.source,
      gateKind: gate.gateKind || 'requirement_integrity',
    },
  };
  throw err;
}

module.exports = {
  assertGate1ConflictAmbiguityOrOverride,
  resolveConflictAmbiguityFromPack,
  isGate1ConflictAmbiguityEnforceEnabled,
  isHardBlockingItem,
  HARD_BLOCK_KINDS,
  LEGACY_BLOCK_KINDS,
};
