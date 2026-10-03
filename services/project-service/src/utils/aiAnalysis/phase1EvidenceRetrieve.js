/**
 * Wave C — Keyword/BM25-lite retrieve over evidenceSpans (no Qdrant).
 * Pure / deterministic: only returns ids that already exist in spans.
 */

const {
  tokenizeEvidenceText,
} = require('../tools/evidence/evidenceSpanExtract');

const DEFAULT_TOP_K = 8;

/**
 * @returns {'stub'|'off'}
 */
function getPhase1RagMode() {
  const raw = String(process.env.PHASE1_RAG ?? 'stub').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') return 'off';
  return 'stub';
}

function resolveTopK(topK) {
  const n = Number(topK);
  if (Number.isFinite(n) && n >= 1) return Math.min(20, Math.floor(n));
  return DEFAULT_TOP_K;
}

/**
 * Score span against query tokens (term frequency + filename boost).
 */
function scoreSpan(queryTokens, span) {
  if (!queryTokens.length) return 0;
  const text = `${span.filename || ''} ${span.text || span.snippet || ''}`;
  const tokens = tokenizeEvidenceText(text);
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

/**
 * @param {{ query?: string, spans?: object[], topK?: number, mode?: string }} args
 * @returns {{ ids: string[], spans: object[], count: number, mode: string, schemaVersion: string }}
 */
function retrieveEvidenceContext({
  query = '',
  spans = [],
  topK = DEFAULT_TOP_K,
  mode = null,
} = {}) {
  const ragMode = mode || getPhase1RagMode();
  const list = Array.isArray(spans) ? spans : [];
  const k = resolveTopK(topK);

  if (!list.length) {
    return {
      schemaVersion: 'phase1EvidenceRetrieve.v1',
      mode: ragMode,
      ids: [],
      spans: [],
      count: 0,
    };
  }

  // off → first-K (Wave A stub order)
  if (ragMode === 'off') {
    const picked = list.slice(0, k);
    return {
      schemaVersion: 'phase1EvidenceRetrieve.v1',
      mode: 'off',
      ids: picked.map((s) => String(s.id)),
      spans: picked,
      count: picked.length,
    };
  }

  const queryTokens = tokenizeEvidenceText(query);
  const scored = list.map((s) => ({
    span: s,
    score: scoreSpan(queryTokens, s),
  }));
  scored.sort((a, b) => b.score - a.score || String(a.span.id).localeCompare(String(b.span.id)));

  const positive = scored.filter((x) => x.score > 0).slice(0, k);
  const picked = (positive.length ? positive : scored.slice(0, k)).map((x) => x.span);
  const ids = picked.map((s) => String(s.id));
  // RULE-C1: only ids from input spans
  const valid = new Set(list.map((s) => String(s.id)));
  const safeIds = ids.filter((id) => valid.has(id));
  const byId = new Map(list.map((s) => [String(s.id), s]));

  return {
    schemaVersion: 'phase1EvidenceRetrieve.v1',
    mode: 'stub',
    ids: safeIds,
    spans: safeIds.map((id) => byId.get(id)).filter(Boolean),
    count: safeIds.length,
  };
}

module.exports = {
  DEFAULT_TOP_K,
  getPhase1RagMode,
  retrieveEvidenceContext,
};
