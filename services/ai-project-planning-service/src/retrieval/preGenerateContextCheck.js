/**
 * Pre-generate context checks (Wave 1) — scope, required, basic citations, provenance.
 */

const { matchesScope } = require('./scopeFilter');
const { isExcludedFromGenerate, isAiDraft } = require('./provenanceFilters');
const { assessEvidenceStatus, deriveCpQuality } = require('./ragStatus');

/**
 * @param {{
 *   contextPackage?: object,
 *   requiredInputs?: object[],
 *   scope?: object,
 *   retrievalStatus?: string,
 * }} args
 */
function preGenerateContextCheck(args = {}) {
  const errors = [];
  const warnings = [];
  const cp = args.contextPackage && typeof args.contextPackage === 'object'
    ? args.contextPackage
    : {};
  const required = Array.isArray(args.requiredInputs)
    ? args.requiredInputs
    : Array.isArray(cp.requiredInputs)
      ? cp.requiredInputs
      : [];
  const citations = Array.isArray(cp.citations) ? cp.citations : [];
  const scope = args.scope || {};
  const retrievalStatus =
    args.retrievalStatus || cp.retrievalStatus || 'ok';

  for (const r of required) {
    if (!String(r?.sourceId || '').trim()) {
      errors.push('required_missing_sourceId');
    }
    if (!String(r?.text || r?.snippet || '').trim()) {
      errors.push(`required_empty:${r?.sourceId || '?'}`);
    }
    if (scope.snapshotId && !matchesScope(r, scope)) {
      errors.push(`required_scope_mismatch:${r?.sourceId || '?'}`);
    }
    if (isExcludedFromGenerate(r)) {
      errors.push(`required_excluded_provenance:${r?.sourceId || '?'}`);
    }
  }

  for (const c of citations) {
    if (c?.required) continue;
    if (!String(c?.sourceId || c?.citationId || '').trim()) {
      warnings.push('citation_missing_sourceId');
    }
    if (isExcludedFromGenerate(c)) {
      warnings.push(`citation_excluded:${c?.sourceId || '?'}`);
    }
    if (isAiDraft(c)) {
      warnings.push(`citation_ai_draft:${c?.sourceId || '?'}`);
    }
  }

  const evidenceStatus = assessEvidenceStatus({
    requiredInputs: required,
    citations,
    conflicting: cp.evidenceStatus === 'conflicting',
    requireEvidence: required.length > 0 || Boolean(args.requireEvidence),
  });

  const cpQuality = deriveCpQuality(retrievalStatus, evidenceStatus);
  const ok =
    errors.length === 0 &&
    evidenceStatus !== 'insufficient' &&
    cp.inputTooLarge !== true;

  return {
    ok,
    errors,
    warnings,
    retrievalStatus,
    evidenceStatus,
    cpQuality,
    canGenerate: ok && cp.inputTooLarge !== true,
  };
}

module.exports = {
  preGenerateContextCheck,
};
