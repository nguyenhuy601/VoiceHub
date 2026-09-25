/**
 * Phase 1 Part 2 — Knowledge stub (no Qdrant).
 * Assembles top-K citations from evidenceSpans (preferred) or intakeCorpus + skill catalog pins.
 * Pure / deterministic; no Mongo/HTTP.
 */

const DEFAULT_TOP_K = 8;
const SNIPPET_MAX = 200;
const FEEDBACK_MAX = 2000;

function isPhase1KnowledgeStubEnabled() {
  const raw = String(process.env.PHASE1_KNOWLEDGE_STUB ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * Sanitize Loop 1 feedback (≤2000 chars, strip controls).
 */
function sanitizePhase1Feedback(raw) {
  const text = String(raw || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, FEEDBACK_MAX);
  return text;
}

function resolveTopK(opts = {}) {
  const n = Number(opts.topK);
  if (Number.isFinite(n) && n >= 1) return Math.min(20, Math.floor(n));
  return DEFAULT_TOP_K;
}

/**
 * @param {{
 *   pack?: object,
 *   skillCatalog?: { version?: string, skills?: string[] },
 *   topK?: number,
 *   evidenceSpans?: object[],
 *   retrievedSpans?: object[],
 * }} args
 */
function assemblePhase1KnowledgeContext({
  pack = {},
  skillCatalog = null,
  topK = DEFAULT_TOP_K,
  evidenceSpans = null,
  retrievedSpans = null,
} = {}) {
  const k = resolveTopK({ topK });
  const citations = [];

  // Prefer retrieved (Wave C) then full evidence spans (Wave A), else corpus excerpts.
  const preferred =
    (Array.isArray(retrievedSpans) && retrievedSpans.length
      ? retrievedSpans
      : null) ||
    (Array.isArray(evidenceSpans) && evidenceSpans.length ? evidenceSpans : null);

  if (preferred) {
    for (let i = 0; i < preferred.length && citations.length < k; i += 1) {
      const s = preferred[i];
      if (!s) continue;
      const snippet = String(s.snippet || s.text || '').slice(0, SNIPPET_MAX);
      if (!snippet.trim()) continue;
      citations.push({
        id: String(s.id || `c-evidence-${i + 1}`),
        source: 'evidence_span',
        filename: String(s.filename || '').slice(0, 260),
        snippet,
        charCount: String(s.text || s.snippet || '').length,
      });
    }
  } else {
    const corpus = pack?.aiAnalysis?.intakeCorpus;
    const excerpts = Array.isArray(corpus?.excerpts) ? corpus.excerpts : [];
    for (let i = 0; i < excerpts.length && citations.length < k; i += 1) {
      const ex = excerpts[i];
      if (!ex) continue;
      const filename = String(ex.filename || `excerpt-${i + 1}`).slice(0, 260);
      const full = String(ex.text || '');
      if (!full.trim()) continue;
      const snippet =
        full.length > SNIPPET_MAX ? `${full.slice(0, SNIPPET_MAX - 1)}…` : full;
      citations.push({
        id: `c-corpus-${i + 1}`,
        source: 'intake_corpus',
        filename,
        snippet,
        charCount: full.length,
      });
    }
  }

  const catalog =
    skillCatalog && typeof skillCatalog === 'object'
      ? skillCatalog
      : pack?.aiAnalysis?.skillCatalogStub ||
        pack?.aiAnalysis?.sources?.skillCatalog ||
        null;
  const skills = Array.isArray(catalog?.skills) ? catalog.skills : [];
  const catalogPins = skills
    .map((name, idx) => {
      const n = String(name || '').trim();
      if (!n) return null;
      return {
        id: `c-skill-${idx + 1}`,
        source: 'skill_catalog',
        name: n.slice(0, 120),
      };
    })
    .filter(Boolean)
    .slice(0, 20);

  for (const pin of catalogPins.slice(0, Math.max(0, k - citations.length))) {
    citations.push({
      id: pin.id,
      source: 'skill_catalog',
      filename: pin.name,
      snippet: `Skill: ${pin.name}`,
      charCount: pin.name.length,
    });
  }

  return {
    stub: true,
    schemaVersion: 'phase1Knowledge.v1',
    citations,
    catalogPins,
    citationCount: citations.length,
    meta: {
      corpusExcerptCount: Array.isArray(pack?.aiAnalysis?.intakeCorpus?.excerpts)
        ? pack.aiAnalysis.intakeCorpus.excerpts.length
        : 0,
      evidenceSpanCount: Array.isArray(evidenceSpans) ? evidenceSpans.length : 0,
      retrievedSpanCount: Array.isArray(retrievedSpans) ? retrievedSpans.length : 0,
      catalogSkillCount: catalogPins.length,
      catalogVersion: catalog?.version ? String(catalog.version) : null,
      topK: k,
      knowledgeEnabled: isPhase1KnowledgeStubEnabled(),
    },
  };
}

/**
 * Compact prompt block — citation ids + short snippets (no full corpus dump).
 */
function formatKnowledgeCitationsBlock(knowledge) {
  if (!knowledge || knowledge.stub !== true) {
    return 'KNOWLEDGE_CITATIONS: (disabled)';
  }
  if (!Array.isArray(knowledge.citations) || !knowledge.citations.length) {
    return 'KNOWLEDGE_CITATIONS: (none)';
  }
  const lines = knowledge.citations.slice(0, 12).map((c) => {
    const snip = String(c.snippet || '').slice(0, 120);
    return `- [${c.id}] (${c.source}) ${c.filename || ''}: ${snip}`;
  });
  return [
    'KNOWLEDGE_CITATIONS (stub — cite ids in clarifications when relevant; do NOT invent metrics):',
    ...lines,
  ].join('\n');
}

/**
 * Persist-safe slim package (omit long snippets beyond cap already applied).
 */
function toPersistedKnowledgeMeta(knowledge) {
  if (!knowledge) return null;
  return {
    stub: true,
    schemaVersion: knowledge.schemaVersion || 'phase1Knowledge.v1',
    citationCount: Number(knowledge.citationCount) || 0,
    citationIds: (knowledge.citations || []).map((c) => c.id).slice(0, 20),
    catalogPinCount: Array.isArray(knowledge.catalogPins)
      ? knowledge.catalogPins.length
      : 0,
    meta: knowledge.meta || {},
  };
}

module.exports = {
  DEFAULT_TOP_K,
  FEEDBACK_MAX,
  SNIPPET_MAX,
  isPhase1KnowledgeStubEnabled,
  sanitizePhase1Feedback,
  assemblePhase1KnowledgeContext,
  formatKnowledgeCitationsBlock,
  toPersistedKnowledgeMeta,
};
