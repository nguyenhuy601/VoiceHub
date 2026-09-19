/**
 * Evidence / provenance helper (Build Spec §3.8).
 * Every tool business claim must attach evidence[].
 */

let evidenceSeq = 0;

function nextEvidenceId(prefix = 'EV') {
  evidenceSeq += 1;
  return `${prefix}-${String(evidenceSeq).padStart(3, '0')}`;
}

/**
 * @param {object} partial
 * @returns {object} evidence record
 */
function createEvidence(partial = {}) {
  const now = new Date().toISOString();
  return {
    evidenceId: partial.evidenceId || nextEvidenceId(),
    sourceType: partial.sourceType || 'unknown',
    sourceId: partial.sourceId != null ? String(partial.sourceId) : null,
    snapshotId: partial.snapshotId != null ? String(partial.snapshotId) : null,
    metric: partial.metric || null,
    value: partial.value !== undefined ? partial.value : null,
    unit: partial.unit || null,
    calculatedBy: partial.calculatedBy || null,
    timestamp: partial.timestamp || now,
    ruleId: partial.ruleId || null,
  };
}

/** Reset counter — tests only */
function _resetEvidenceSeqForTests() {
  evidenceSeq = 0;
}

module.exports = {
  createEvidence,
  nextEvidenceId,
  _resetEvidenceSeqForTests,
};
