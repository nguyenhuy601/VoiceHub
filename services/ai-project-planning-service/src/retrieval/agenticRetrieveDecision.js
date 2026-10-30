/**
 * Agentic retrieve decision contract (Wave 2).
 * LLM proposes queries; LangGraph validates and runs shared pipeline — no scope expansion.
 */

const ALLOWED_DECISIONS = Object.freeze([
  'retrieve_more',
  'generate',
  'clarify',
  'stop_incomplete',
]);

const MAX_QUERIES = 3;
const MAX_QUERY_LEN = 400;

/**
 * @param {unknown} raw
 * @param {{ allowDocTypes?: string[] }} [opts]
 */
function parseAgenticRetrieveDecision(raw, opts = {}) {
  const errors = [];
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ['invalid_json'] };
    }
  }
  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['decision_object_required'] };
  }

  const decision = String(obj.decision || '').trim();
  if (!ALLOWED_DECISIONS.includes(decision)) {
    errors.push(`decision_invalid:${decision || 'empty'}`);
  }

  const missingInformation = Array.isArray(obj.missingInformation)
    ? obj.missingInformation.map((s) => String(s || '').trim()).filter(Boolean)
    : [];

  const allowDocTypes = new Set(
    Array.isArray(opts.allowDocTypes) && opts.allowDocTypes.length
      ? opts.allowDocTypes
      : [
          'business_rule',
          'evidence_span',
          'customer_raw',
          'overview',
          'business_goal',
          'scope_item',
          'actor',
          'srs_canonical',
          'srs_nfr',
          'srs_uc',
          'srs_ac',
          'metric_def',
        ]
  );

  const queries = [];
  if (decision === 'retrieve_more') {
    const list = Array.isArray(obj.queries) ? obj.queries : [];
    if (!list.length) errors.push('queries_required_for_retrieve_more');
    for (let i = 0; i < Math.min(list.length, MAX_QUERIES); i += 1) {
      const q = list[i];
      if (!q || typeof q !== 'object') {
        errors.push(`queries[${i}]_invalid`);
        continue;
      }
      const query = String(q.query || '').trim().slice(0, MAX_QUERY_LEN);
      if (!query) {
        errors.push(`queries[${i}]_empty`);
        continue;
      }
      const targetDocTypes = (Array.isArray(q.targetDocTypes) ? q.targetDocTypes : [])
        .map((t) => String(t || '').trim())
        .filter((t) => allowDocTypes.has(t));
      // Strip any attempt to pass scope overrides from LLM
      queries.push({ query, targetDocTypes });
    }
    if (list.length > MAX_QUERIES) {
      errors.push('queries_truncated');
    }
  }

  // Reject LLM-supplied scope expansion keys if present
  if (obj.tenantId != null || obj.projectId != null || obj.snapshotId != null) {
    errors.push('scope_override_forbidden');
  }
  if (obj.elevateAiDraft === true || obj.approvalStatus === 'approved') {
    errors.push('authority_elevation_forbidden');
  }

  if (errors.length && decision === 'retrieve_more' && !queries.length) {
    return { ok: false, errors };
  }

  return {
    ok: errors.filter((e) => e !== 'queries_truncated').length === 0,
    errors,
    decision: {
      decision,
      missingInformation,
      queries,
    },
  };
}

module.exports = {
  parseAgenticRetrieveDecision,
  ALLOWED_DECISIONS,
  MAX_QUERIES,
  MAX_QUERY_LEN,
};
