/**
 * Wave B — claim_grounding_check: token overlap claim vs cited evidence spans.
 * Pure / deterministic: no Mongo, HTTP, LLM, Date.now().
 */

const {
  tokenizeEvidenceText,
  sanitizeEvidenceIds,
} = require('./evidenceSpanExtract');

const DEFAULT_THRESHOLD = 0.15;

/**
 * @returns {'drop'|'flag'|'off'}
 */
function getPhase1GroundingMode() {
  const raw = String(process.env.PHASE1_GROUNDING_MODE ?? 'drop').trim().toLowerCase();
  if (raw === 'flag') return 'flag';
  if (raw === 'off' || raw === '0' || raw === 'false') return 'off';
  return 'drop';
}

function resolveGroundingThreshold(explicit) {
  if (Number.isFinite(explicit)) {
    return Math.min(1, Math.max(0, Number(explicit)));
  }
  const env = Number(process.env.PHASE1_GROUNDING_THRESHOLD);
  if (Number.isFinite(env)) return Math.min(1, Math.max(0, env));
  return DEFAULT_THRESHOLD;
}

/**
 * @param {{ claimText: string, spans?: object[], evidenceIds?: string[], threshold?: number }} args
 * @returns {{ status: 'pass'|'fail', score: number, threshold: number, citedCount: number }}
 */
function claimGroundingCheck({
  claimText = '',
  spans = [],
  evidenceIds = [],
  threshold,
} = {}) {
  const thr = resolveGroundingThreshold(threshold);
  const ids = sanitizeEvidenceIds(evidenceIds, spans);
  const idSet = new Set(ids);
  const cited = (Array.isArray(spans) ? spans : []).filter((s) => idSet.has(String(s.id)));
  const corpus = cited.map((s) => String(s.text || s.snippet || '')).join(' ');
  const claimTokens = tokenizeEvidenceText(claimText);
  const spanTokens = new Set(tokenizeEvidenceText(corpus));

  if (!claimTokens.length || !spanTokens.size || !ids.length) {
    return {
      status: 'fail',
      score: 0,
      threshold: thr,
      citedCount: ids.length,
    };
  }

  let hit = 0;
  for (const t of claimTokens) {
    if (spanTokens.has(t)) hit += 1;
  }
  const score = Math.round((hit / claimTokens.length) * 1000) / 1000;
  return {
    status: score >= thr ? 'pass' : 'fail',
    score,
    threshold: thr,
    citedCount: ids.length,
  };
}

/**
 * Apply grounding to FR seed rows + NFR-like rows.
 * @returns {{ rows: object[], passCount: number, failCount: number, skippedGrounding: number }}
 */
function applyGroundingToSeedRows(rows, spans, { mode = null } = {}) {
  const groundingMode = mode || getPhase1GroundingMode();
  const list = Array.isArray(rows) ? rows : [];
  if (groundingMode === 'off' || !list.length) {
    return {
      rows: list,
      passCount: 0,
      failCount: 0,
      skippedGrounding: 0,
    };
  }

  const out = [];
  let passCount = 0;
  let failCount = 0;
  let skippedGrounding = 0;

  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const level = String(row.level || '').toLowerCase();
    if (level === 'module' || level === 'feature') {
      out.push(row);
      continue;
    }
    const claimText = String(
      row.description || row.name || row.requirement || row.title || row.text || ''
    );
    const result = claimGroundingCheck({
      claimText,
      spans,
      evidenceIds: row.evidenceIds,
    });
    if (result.status === 'pass') {
      passCount += 1;
      out.push({
        ...row,
        groundingStatus: 'pass',
        groundingScore: result.score,
      });
      continue;
    }
    failCount += 1;
    if (groundingMode === 'drop') {
      skippedGrounding += 1;
      continue;
    }
    // flag mode — keep with status
    out.push({
      ...row,
      groundingStatus: 'fail',
      groundingScore: result.score,
      baNote: [String(row.baNote || '').trim(), 'grounding:ungrounded']
        .filter(Boolean)
        .join('; '),
    });
  }

  return { rows: out, passCount, failCount, skippedGrounding };
}

module.exports = {
  DEFAULT_THRESHOLD,
  getPhase1GroundingMode,
  claimGroundingCheck,
  applyGroundingToSeedRows,
};
