/**
 * Independent retrieval vs evidence status (Wave 1).
 * cpQuality remains for compat = deriveCpQuality(retrieval, evidence).
 */

const RETRIEVAL_STATUS = Object.freeze(['ok', 'degraded', 'failed']);
const EVIDENCE_STATUS = Object.freeze(['sufficient', 'insufficient', 'conflicting']);

/**
 * @param {'ok'|'degraded'|'failed'} retrievalStatus
 * @param {'sufficient'|'insufficient'|'conflicting'} evidenceStatus
 * @returns {string}
 */
function deriveCpQuality(retrievalStatus, evidenceStatus) {
  const r = String(retrievalStatus || '').trim();
  const e = String(evidenceStatus || '').trim();
  if (r === 'failed') return 'bad';
  if (e === 'conflicting') return 'conflict';
  if (e === 'insufficient') return 'insufficient';
  if (r === 'degraded' && e === 'sufficient') return 'degraded_ok';
  if (r === 'ok' && e === 'sufficient') return 'ok';
  return 'unknown';
}

/**
 * Heuristic evidence status for a task assemble result.
 * @param {{
 *   requiredInputs?: object[],
 *   citations?: object[],
 *   conflicting?: boolean,
 *   requireEvidence?: boolean,
 * }} args
 */
function assessEvidenceStatus(args = {}) {
  if (args.conflicting === true) return 'conflicting';
  const required = Array.isArray(args.requiredInputs) ? args.requiredInputs : [];
  const missingRequired = required.some(
    (r) => !r || (!String(r.text || r.snippet || '').trim() && !String(r.sourceId || '').trim())
  );
  if (missingRequired || (args.requireEvidence && required.length === 0)) {
    return 'insufficient';
  }
  // Required present → sufficient for 2-step; supplement optional
  if (required.length > 0) return 'sufficient';
  const citations = Array.isArray(args.citations) ? args.citations : [];
  if (citations.length > 0) return 'sufficient';
  if (args.requireEvidence) return 'insufficient';
  return 'sufficient';
}

module.exports = {
  RETRIEVAL_STATUS,
  EVIDENCE_STATUS,
  deriveCpQuality,
  assessEvidenceStatus,
};
