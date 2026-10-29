/**
 * RAG Semantic & Knowledge / RAG — Build Contract schemas (Wave C shape + Wave D+ modes).
 * SoT narrative: .cursor/plans/ai-project-g1-g7-build-contracts.md
 * RULE-07: RAG must not assign / estimate / schedule / approve.
 */

const RAG_CONTRACT_VERSION = 'rag.v1';

/** Wave C Context Package (backward compatible). */
const CONTEXT_PACKAGE_FIELDS = Object.freeze(['query', 'citations', 'assembledAt']);

/** Production modes — stub remains default until Qdrant Wave D+. */
const RAG_MODES = Object.freeze(['stub', 'keyword', 'hybrid', 'qdrant', 'off']);

const QUERY_INTENTS = Object.freeze([
  'requirement_evidence',
  'skill_def',
  'metric_def',
  'history_snippet',
  'how_planning',
  'general',
]);

/**
 * @typedef {{
 *   citationId: string,
 *   sourceId: string,
 *   snippet: string,
 *   score: number
 * }} Citation
 */

/**
 * @typedef {{
 *   query: string,
 *   citations: Citation[],
 *   assembledAt: string,
 *   mode?: string,
 *   intent?: string,
 *   stub?: boolean
 * }} ContextPackage
 */

/**
 * Resolve RAG mode from env (default stub — Wave C).
 * @returns {'stub'|'keyword'|'hybrid'|'qdrant'|'off'}
 */
function getRagMode(env = process.env) {
  const raw = String(env.RAG_MODE ?? 'stub').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') return 'off';
  if (RAG_MODES.includes(raw)) return raw;
  return 'stub';
}

/** hybrid and qdrant both require a successful Qdrant ingest and search. */
function requiresQdrant(mode) {
  return mode === 'qdrant' || mode === 'hybrid';
}

/**
 * Classify query intent (deterministic heuristics for Wave D keyword path).
 * Full LLM intent classification is optional later — must stay testable without model.
 * @param {string} query
 * @returns {typeof QUERY_INTENTS[number]}
 */
function classifyQueryIntent(query = '') {
  const q = String(query).toLowerCase();
  if (!q.trim()) return 'general';
  // HOW assemble queries (howPhaseGraph) — how_planning / how_planning_gap
  if (
    /how_planning/.test(q) ||
    /\bhow planning\b/.test(q) ||
    /\bquality plan\b/.test(q) ||
    /\bdeploy plan\b/.test(q)
  ) {
    return 'how_planning';
  }
  if (/\b(metric|capacity|hours|effort|allocation)\b/.test(q)) return 'metric_def';
  if (/\b(skill|competenc|ngôn ngữ|framework|stack|technology|tech stack)\b/.test(q)) {
    return 'skill_def';
  }
  if (/\b(history|past project|kinh nghiệm|experience)\b/.test(q)) return 'history_snippet';
  if (
    /\b(requirement|fr-|nfr|srs|evidence|accept|use.?case|uc-|acceptance)\b/.test(q)
  ) {
    return 'requirement_evidence';
  }
  return 'general';
}

/**
 * Filter citations to those whose sourceId exists in allowed set (RULE-C1 / snapshot scope).
 * @param {Citation[]} citations
 * @param {Set<string>|string[]} allowedSourceIds
 */
function filterCitationsToCorpus(citations, allowedSourceIds) {
  const allowed = allowedSourceIds instanceof Set
    ? allowedSourceIds
    : new Set((allowedSourceIds || []).map(String));
  return (Array.isArray(citations) ? citations : []).filter((c) =>
    allowed.has(String(c?.sourceId || ''))
  );
}

/**
 * @param {unknown} pkg
 * @returns {{ ok: boolean, errors: string[], package?: ContextPackage }}
 */
function validateContextPackage(pkg) {
  const errors = [];
  if (!pkg || typeof pkg !== 'object') {
    return { ok: false, errors: ['contextPackage required'] };
  }
  if (typeof pkg.query !== 'string') errors.push('query must be string');
  if (!Array.isArray(pkg.citations)) {
    errors.push('citations must be array');
  } else {
    pkg.citations.forEach((c, i) => {
      if (!c || typeof c !== 'object') {
        errors.push(`citations[${i}] invalid`);
        return;
      }
      if (!String(c.citationId || '').trim()) errors.push(`citations[${i}].citationId required`);
      if (!String(c.sourceId || '').trim()) errors.push(`citations[${i}].sourceId required`);
      if (typeof c.snippet !== 'string') errors.push(`citations[${i}].snippet must be string`);
      if (typeof c.score !== 'number' || !Number.isFinite(c.score)) {
        errors.push(`citations[${i}].score must be finite number`);
      }
    });
  }
  if (!String(pkg.assembledAt || '').trim()) errors.push('assembledAt required');
  if (pkg.mode != null && !RAG_MODES.includes(String(pkg.mode))) {
    errors.push(`mode must be one of ${RAG_MODES.join('|')}`);
  }
  if (pkg.intent != null && !QUERY_INTENTS.includes(String(pkg.intent))) {
    errors.push(`intent must be one of ${QUERY_INTENTS.join('|')}`);
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    package: {
      query: String(pkg.query),
      citations: pkg.citations.map((c) => ({
        citationId: String(c.citationId),
        sourceId: String(c.sourceId),
        snippet: String(c.snippet),
        score: Number(c.score),
      })),
      assembledAt: String(pkg.assembledAt),
      mode: pkg.mode != null ? String(pkg.mode) : undefined,
      intent: pkg.intent != null ? String(pkg.intent) : undefined,
      stub: pkg.stub === true ? true : pkg.stub === false ? false : undefined,
    },
  };
}

/**
 * Four pipeline steps — implemented as:
 * classifyQueryIntent → retrieve (stub|keyword|hybrid|qdrant) → rerankAndFilter → assemble.
 * Mode behavior:
 * - stub|off — substring / empty (stub: true)
 * - keyword — BM25-lite (stub: false)
 * - hybrid — keyword ∪ Qdrant; Qdrant errors fail the run
 * - qdrant — Qdrant only; errors fail the run
 */
const RAG_PIPELINE_STEPS = Object.freeze([
  'query_intent',
  'retrieve',
  'rerank_filter',
  'context_assembly',
]);

module.exports = {
  RAG_CONTRACT_VERSION,
  CONTEXT_PACKAGE_FIELDS,
  RAG_MODES,
  QUERY_INTENTS,
  RAG_PIPELINE_STEPS,
  getRagMode,
  requiresQdrant,
  classifyQueryIntent,
  filterCitationsToCorpus,
  validateContextPackage,
};
