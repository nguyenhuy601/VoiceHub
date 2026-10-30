/**
 * RAG keyword retrieve — BM25-lite over corpus docs (Step 4).
 * Scoring ported from phase1EvidenceRetrieve.scoreSpan; intent boosts preferred docTypes.
 */

const { tokenize } = require('./tokenize');
const { docText, docSourceId, SNIPPET_MAX } = require('./retrieveStub');

const INTENT_BOOST = 0.35;

/** Intent → preferred docType(s); boost only, never hard-drop. */
const INTENT_DOC_TYPES = Object.freeze({
  skill_def: Object.freeze(['skill_def', 'srs_technology']),
  metric_def: Object.freeze(['metric_def']),
  requirement_evidence: Object.freeze([
    'evidence_span',
    'customer_raw',
    'overview',
    'business_goal',
    'business_rule',
    'scope_item',
    'actor',
    'srs_canonical',
    'srs_nfr',
    'srs_uc',
    'srs_ac',
  ]),
  /** HOW planning assemble (Quality / Arch / Deploy context) */
  how_planning: Object.freeze([
    'srs_nfr',
    'srs_uc',
    'srs_ac',
    'srs_technology',
    'srs_canonical',
    'skill_def',
  ]),
  history_snippet: Object.freeze(['employee_history']),
  general: Object.freeze([]),
});

/**
 * Term-frequency score (BM25-lite) — same formula as Phase1 scoreSpan.
 * @param {string[]} queryTokens
 * @param {string} text
 */
function scoreText(queryTokens, text) {
  if (!queryTokens.length) return 0;
  const tokens = tokenize(text);
  if (!tokens.length) return 0;
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  let score = 0;
  for (const q of queryTokens) {
    const f = tf.get(q) || 0;
    if (f > 0) score += 1 + Math.log(1 + f);
  }
  return score / queryTokens.length;
}

function preferredDocTypes(intent) {
  return INTENT_DOC_TYPES[intent] || INTENT_DOC_TYPES.general;
}

/**
 * @param {{ query?: string, corpus?: object[], intent?: string, scope?: object }} args
 * @returns {{ docs: object[], modeUsed: 'keyword' }}
 */
function retrieveKeyword({ query = '', corpus = [], intent = 'general', scope = null } = {}) {
  let list = Array.isArray(corpus) ? corpus : [];
  if (scope && (scope.snapshotId || scope.projectId || scope.tenantId)) {
    const { filterDocsByScope } = require('./scopeFilter');
    const { filterDocsForGenerate } = require('./provenanceFilters');
    list = filterDocsForGenerate(filterDocsByScope(list, scope));
  }
  const queryTokens = tokenize(query);
  const preferred = new Set(preferredDocTypes(intent));

  const scored = list.map((doc, i) => {
    const text = docText(doc);
    const sourceId = docSourceId(doc, i);
    let score = scoreText(queryTokens, text);
    const docType = String(doc.docType || '');
    if (preferred.size && preferred.has(docType) && score > 0) {
      score += INTENT_BOOST;
    }
    return {
      ...doc,
      sourceId,
      id: doc.id || doc.sourceId || sourceId,
      text,
      snippet: text.slice(0, SNIPPET_MAX),
      score,
      _corpusIndex: i,
    };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score || String(a.sourceId).localeCompare(String(b.sourceId))
  );

  // Prefer positive scores; if none match, keep ranked list (caller topK via rerank)
  const positive = scored.filter((d) => d.score > 0);
  const docs = positive.length ? positive : [];

  return { docs, modeUsed: 'keyword' };
}

module.exports = {
  retrieveKeyword,
  scoreText,
  preferredDocTypes,
  INTENT_BOOST,
  INTENT_DOC_TYPES,
};
