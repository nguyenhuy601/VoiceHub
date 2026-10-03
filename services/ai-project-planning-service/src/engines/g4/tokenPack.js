/**
 * Token-budget packing for LLM batches (replaces FR_CHUNK_SIZE).
 */

function estimateTokens(text) {
  const s = String(text || '');
  // Rough: ~4 chars/token for mixed VI/EN
  return Math.max(1, Math.ceil(s.length / 4));
}

function candidatePayloadSize(candidate) {
  const body = JSON.stringify({
    frId: candidate.frId,
    text: candidate.text,
    signals: {
      actors: candidate.actors,
      actions: candidate.actions,
      objects: candidate.objects,
      fields: candidate.fields,
      module: candidate.module,
    },
    flags: candidate.reasons || candidate.flags,
  });
  return estimateTokens(body);
}

/**
 * @param {object[]} candidates
 * @param {{ maxInputTokens?: number, maxCalls?: number }} opts
 * @returns {object[][]} batches
 */
function packByTokenBudget(candidates = [], opts = {}) {
  const maxInput = opts.maxInputTokens != null ? Number(opts.maxInputTokens) : 2800;
  const maxCalls = opts.maxCalls != null ? Number(opts.maxCalls) : 3;
  const overhead = 200;
  const budget = Math.max(400, maxInput - overhead);
  const batches = [];
  let current = [];
  let used = 0;

  for (const c of candidates) {
    if (batches.length >= maxCalls) break;
    const cost = candidatePayloadSize(c);
    if (current.length && used + cost > budget) {
      batches.push(current);
      if (batches.length >= maxCalls) break;
      current = [];
      used = 0;
    }
    current.push(c);
    used += cost;
  }
  if (current.length && batches.length < maxCalls) batches.push(current);
  return batches;
}

module.exports = {
  estimateTokens,
  candidatePayloadSize,
  packByTokenBudget,
};
