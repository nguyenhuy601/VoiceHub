/**
 * Evidence / provenance helper (Build Spec §3.8 + Track C).
 * Every tool business claim must attach evidence[].
 * Confidence alone never satisfies RULE-10 / G13.
 * G1: when metric is set, it must resolve in platform metric catalog (unless G1_METRIC_ENFORCE=0).
 */

const {
  resolveMetric,
  isMetricEnforceEnabled,
  catalogMiss,
} = require('../knowledge/g1CatalogSchemas');

let evidenceSeq = 0;

function nextEvidenceId(prefix = 'EV') {
  evidenceSeq += 1;
  return `${prefix}-${String(evidenceSeq).padStart(3, '0')}`;
}

function isEvidenceEnforceEnabled(env = process.env) {
  const raw = String(env.EVIDENCE_ENFORCE ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * @param {object} partial
 * @returns {object} evidence record
 */
function createEvidence(partial = {}) {
  const metric =
    partial.metric != null && String(partial.metric).trim()
      ? String(partial.metric).trim()
      : null;

  if (metric && isMetricEnforceEnabled()) {
    const entry = resolveMetric(metric);
    if (!entry) {
      const miss = catalogMiss('metric', metric, 'error');
      const err = new Error(miss.message);
      err.code = miss.code;
      err.catalogMiss = miss;
      throw err;
    }
  }

  const now = new Date().toISOString();
  return {
    evidenceId: partial.evidenceId || nextEvidenceId(),
    sourceType: partial.sourceType || 'unknown',
    sourceId: partial.sourceId != null ? String(partial.sourceId) : null,
    snapshotId: partial.snapshotId != null ? String(partial.snapshotId) : null,
    metric,
    value: partial.value !== undefined ? partial.value : null,
    unit: partial.unit || null,
    calculatedBy: partial.calculatedBy || null,
    timestamp: partial.timestamp || now,
    ruleId: partial.ruleId || null,
  };
}

/**
 * RULE-10 / Track C: business tool output must carry evidence[].
 * Confidence on the payload is ignored — never a substitute for provenance.
 *
 * @param {string} toolName
 * @param {{ evidence?: unknown, confidence?: unknown }} toolOut
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
function assertToolOutputHasEvidence(toolName, toolOut, opts = {}) {
  const env = opts.env || process.env;
  if (!isEvidenceEnforceEnabled(env)) {
    return { ok: true, skipped: true };
  }
  const list = Array.isArray(toolOut?.evidence) ? toolOut.evidence : null;
  if (list && list.length > 0) {
    return { ok: true, count: list.length };
  }
  const err = new Error(
    `Tool "${toolName}" returned no evidence[] — confidence alone is not provenance (RULE-10)`
  );
  err.code = 'EVIDENCE_REQUIRED';
  err.statusCode = 422;
  err.details = {
    toolName,
    hasConfidence: toolOut?.confidence != null,
    // Explicit: confidence must not be treated as pass
    confidenceDoesNotSatisfyEvidence: true,
  };
  throw err;
}

/** Reset counter — tests only */
function _resetEvidenceSeqForTests() {
  evidenceSeq = 0;
}

module.exports = {
  createEvidence,
  nextEvidenceId,
  assertToolOutputHasEvidence,
  isEvidenceEnforceEnabled,
  _resetEvidenceSeqForTests,
};
