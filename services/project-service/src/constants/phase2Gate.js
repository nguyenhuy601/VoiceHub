/**
 * Phase 1 → Phase 2 (development) readiness gate.
 * SSOT: docs/adr/0002-create-project-and-phase2-gate.md
 */

const {
  ANALYSIS_ARTIFACT_KINDS,
} = require('./analysisArtifact');

/** Kinds that must be present & fully approved before Phase 2 notify */
const PHASE1_REQUIRED_KINDS = Object.freeze([
  'BG',
  'BR',
  'BPM',
  'FR',
  'UC',
  'NFR',
  'SCOPE',
]);

const NON_APPROVED_STATUSES = Object.freeze([
  'draft',
  'ba_review',
  'tech_review',
  'po_review',
  'rejected',
]);

/**
 * @param {{
 *   artifacts?: Array<{ kind?: string, status?: string, isActive?: boolean }>,
 *   criticalGapCount?: number,
 *   deliveryPhase?: string,
 * }} input
 */
function evaluateReadyForPhase2(input = {}) {
  const deliveryPhase = String(input.deliveryPhase || '')
    .trim()
    .toLowerCase();
  const blockingReasons = [];

  if (deliveryPhase && deliveryPhase !== 'requirement_analysis' && deliveryPhase !== 'delivery_planning') {
    blockingReasons.push({
      code: 'WRONG_PHASE',
      message: `deliveryPhase=${deliveryPhase} không phải cửa sổ Phase 1`,
    });
  }

  const artifacts = (Array.isArray(input.artifacts) ? input.artifacts : []).filter(
    (a) => a && a.isActive !== false
  );

  for (const kind of PHASE1_REQUIRED_KINDS) {
    const ofKind = artifacts.filter((a) => String(a.kind || '').toUpperCase() === kind);
    if (!ofKind.length) {
      blockingReasons.push({ code: `MISSING_KIND_${kind}`, message: `Chưa có artifact ${kind}` });
      continue;
    }
    const approved = ofKind.filter((a) => String(a.status || '').toLowerCase() === 'approved');
    if (!approved.length) {
      blockingReasons.push({
        code: `NO_APPROVED_${kind}`,
        message: `Chưa có ${kind} ở trạng thái approved`,
      });
    }
    const pending = ofKind.filter((a) =>
      NON_APPROVED_STATUSES.includes(String(a.status || '').toLowerCase())
    );
    if (pending.length) {
      blockingReasons.push({
        code: `PENDING_${kind}`,
        message: `${kind} còn ${pending.length} bản chưa approved`,
      });
    }
  }

  const criticalGapCount = Number(input.criticalGapCount) || 0;
  if (criticalGapCount > 0) {
    blockingReasons.push({
      code: 'CRITICAL_GAPS',
      message: `Còn ${criticalGapCount} critical gap`,
    });
  }

  return {
    readyForPhase2: blockingReasons.length === 0,
    blockingReasons,
    requiredKinds: [...PHASE1_REQUIRED_KINDS],
  };
}

module.exports = {
  PHASE1_REQUIRED_KINDS,
  NON_APPROVED_STATUSES,
  evaluateReadyForPhase2,
  ANALYSIS_ARTIFACT_KINDS,
};
