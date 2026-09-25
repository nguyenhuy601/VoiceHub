/**
 * Wave A — Split intakeCorpus excerpts into evidence spans with stable ids.
 * Pure / deterministic: no Mongo, HTTP, LLM, Date.now().
 */

const SNIPPET_MAX = 200;
const CHUNK_MAX = 600;
const MAX_SPANS = 80;

function isPhase1RequireEvidence() {
  const raw = String(process.env.PHASE1_REQUIRE_EVIDENCE ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function resolveCorpus(source) {
  if (!source) return null;
  if (Array.isArray(source.excerpts)) return source;
  if (source.aiAnalysis?.intakeCorpus) return source.aiAnalysis.intakeCorpus;
  if (source.intakeCorpus) return source.intakeCorpus;
  return null;
}

/**
 * Split long text into paragraph/chunk windows (stable order).
 */
function splitIntoChunks(text, maxChars = CHUNK_MAX) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = '';
  const flush = () => {
    if (buf.trim()) chunks.push(buf.trim());
    buf = '';
  };
  for (const p of paragraphs.length ? paragraphs : [raw]) {
    if (p.length > maxChars) {
      flush();
      for (let i = 0; i < p.length; i += maxChars) {
        chunks.push(p.slice(i, i + maxChars).trim());
      }
      continue;
    }
    if (!buf) {
      buf = p;
    } else if (`${buf}\n\n${p}`.length <= maxChars) {
      buf = `${buf}\n\n${p}`;
    } else {
      flush();
      buf = p;
    }
  }
  flush();
  return chunks.length ? chunks : [raw.slice(0, maxChars)];
}

function makeSnippet(text) {
  const full = String(text || '');
  if (full.length <= SNIPPET_MAX) return full;
  return `${full.slice(0, SNIPPET_MAX - 1)}…`;
}

/**
 * @param {object} source — corpus `{ excerpts }` or pack with `aiAnalysis.intakeCorpus`
 * @param {{ maxSpans?: number, chunkMax?: number }} [opts]
 * @returns {{ spans: object[], spanCount: number, schemaVersion: string }}
 */
function extractEvidenceSpans(source, opts = {}) {
  const corpus = resolveCorpus(source);
  const excerpts = Array.isArray(corpus?.excerpts) ? corpus.excerpts : [];
  const maxSpans = Number.isFinite(opts.maxSpans)
    ? Math.max(1, Math.min(200, Math.floor(opts.maxSpans)))
    : MAX_SPANS;
  const chunkMax = Number.isFinite(opts.chunkMax)
    ? Math.max(80, Math.min(4000, Math.floor(opts.chunkMax)))
    : CHUNK_MAX;

  const spans = [];
  for (let ei = 0; ei < excerpts.length && spans.length < maxSpans; ei += 1) {
    const ex = excerpts[ei];
    if (!ex) continue;
    const filename = String(ex.filename || `excerpt-${ei + 1}`).slice(0, 260);
    const full = String(ex.text || '');
    if (!full.trim()) continue;
    const chunks = splitIntoChunks(full, chunkMax);
    let offset = 0;
    for (let ci = 0; ci < chunks.length && spans.length < maxSpans; ci += 1) {
      const text = chunks[ci];
      const charStart = full.indexOf(text, offset);
      const start = charStart >= 0 ? charStart : offset;
      const end = start + text.length;
      offset = end;
      spans.push({
        id: `e-span-${ei + 1}-${ci + 1}`,
        filename,
        snippet: makeSnippet(text),
        text,
        excerptIndex: ei,
        chunkIndex: ci,
        charStart: start,
        charEnd: end,
        documentId: ex.documentId ? String(ex.documentId) : undefined,
      });
    }
  }

  return {
    schemaVersion: 'evidenceSpans.v1',
    spans,
    spanCount: spans.length,
  };
}

/**
 * Persist-safe spans (omit full `text` dump).
 */
function toPersistedEvidenceSpans(spans) {
  return (Array.isArray(spans) ? spans : []).slice(0, MAX_SPANS).map((s) => ({
    id: String(s.id),
    filename: String(s.filename || '').slice(0, 260),
    snippet: makeSnippet(s.snippet || s.text || ''),
    excerptIndex: Number.isFinite(s.excerptIndex) ? s.excerptIndex : undefined,
    chunkIndex: Number.isFinite(s.chunkIndex) ? s.chunkIndex : undefined,
    documentId: s.documentId ? String(s.documentId) : undefined,
  }));
}

/**
 * Tokenize for overlap / retrieve (shared lightweight).
 */
function tokenizeEvidenceText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Pick best-matching evidence ids for a claim (never invent ids).
 * @returns {string[]}
 */
function pickEvidenceIdsForClaim(claimText, spans, maxIds = 3) {
  const list = Array.isArray(spans) ? spans : [];
  if (!list.length) return [];
  const claimTokens = tokenizeEvidenceText(claimText);
  if (!claimTokens.length) {
    return [String(list[0].id)];
  }
  const scored = list.map((s) => {
    const set = new Set(tokenizeEvidenceText(s.text || s.snippet || ''));
    let hit = 0;
    for (const t of claimTokens) {
      if (set.has(t)) hit += 1;
    }
    return { id: String(s.id), score: hit / claimTokens.length };
  });
  scored.sort((a, b) => b.score - a.score);
  const positive = scored.filter((x) => x.score > 0).slice(0, Math.max(1, maxIds));
  if (positive.length) return positive.map((x) => x.id);
  return [String(list[0].id)];
}

/**
 * Keep only evidenceIds that exist in the span list.
 */
function sanitizeEvidenceIds(evidenceIds, spans) {
  const valid = new Set((Array.isArray(spans) ? spans : []).map((s) => String(s.id)));
  return (Array.isArray(evidenceIds) ? evidenceIds : [])
    .map((id) => String(id || '').trim())
    .filter((id) => id && valid.has(id));
}

/**
 * Drop Requirement-level FR rows (and optional NFR) missing evidence when policy on.
 */
function filterSeedRowsRequiringEvidence(rows, { require = null, levelKey = 'level' } = {}) {
  const must = require == null ? isPhase1RequireEvidence() : Boolean(require);
  if (!must || !Array.isArray(rows)) {
    return { kept: rows || [], skippedNoCite: 0 };
  }
  const kept = [];
  let skippedNoCite = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const level = String(row[levelKey] || row.level || '').toLowerCase();
    const isLeaf =
      level === 'requirement' ||
      level === 'nfr' ||
      (!level && Array.isArray(row.evidenceIds));
    if (!isLeaf && (level === 'module' || level === 'feature')) {
      kept.push(row);
      continue;
    }
    if (isLeaf || level === '') {
      const ids = Array.isArray(row.evidenceIds) ? row.evidenceIds.filter(Boolean) : [];
      if (ids.length < 1) {
        skippedNoCite += 1;
        continue;
      }
    }
    kept.push(row);
  }
  return { kept, skippedNoCite };
}

module.exports = {
  SNIPPET_MAX,
  CHUNK_MAX,
  MAX_SPANS,
  isPhase1RequireEvidence,
  extractEvidenceSpans,
  toPersistedEvidenceSpans,
  tokenizeEvidenceText,
  pickEvidenceIdsForClaim,
  sanitizeEvidenceIds,
  filterSeedRowsRequiringEvidence,
};
