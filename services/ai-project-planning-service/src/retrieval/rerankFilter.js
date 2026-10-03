/**
 * G7 rerank + filter step — score sort, topK, RULE-C1 corpus id filter.
 */

const { filterCitationsToCorpus } = require('./g7PipelineSchemas');
const { SNIPPET_MAX } = require('./retrieveStub');

const DEFAULT_TOP_K = 5;

function resolveTopK(topK) {
  const n = Number(topK);
  if (Number.isFinite(n) && n >= 1) return Math.min(20, Math.floor(n));
  return DEFAULT_TOP_K;
}

/**
 * @param {{ docs?: object[], corpus?: object[], topK?: number }} args
 * @returns {{ citationId: string, sourceId: string, snippet: string, score: number }[]}
 */
function rerankAndFilter({ docs = [], corpus = [], topK = DEFAULT_TOP_K } = {}) {
  const k = resolveTopK(topK);
  const list = Array.isArray(docs) ? docs : [];

  const ranked = [...list]
    .map((doc, i) => ({
      ...doc,
      score: typeof doc.score === 'number' && Number.isFinite(doc.score) ? doc.score : 1 / (i + 1),
    }))
    .sort((a, b) => b.score - a.score || String(a.sourceId || '').localeCompare(String(b.sourceId || '')));

  let citations = ranked.slice(0, k).map((doc, i) => ({
    citationId: `CIT-${i + 1}`,
    sourceId: String(doc.sourceId || doc.id || `doc-${i}`),
    snippet: String(doc.snippet || doc.text || doc.content || '').slice(0, SNIPPET_MAX),
    score: doc.score,
  }));

  const allowed = (Array.isArray(corpus) ? corpus : [])
    .map((d, i) => String(d.id || d.sourceId || '').trim() || '')
    .filter(Boolean);

  // If corpus has explicit ids, enforce RULE-C1; if none, keep citation sourceIds from retrieve
  if (allowed.length) {
    citations = filterCitationsToCorpus(citations, allowed);
  }

  // Re-number after filter so citationIds stay contiguous CIT-1..n
  return citations.map((c, i) => ({
    ...c,
    citationId: `CIT-${i + 1}`,
  }));
}

module.exports = {
  rerankAndFilter,
  resolveTopK,
  DEFAULT_TOP_K,
};
