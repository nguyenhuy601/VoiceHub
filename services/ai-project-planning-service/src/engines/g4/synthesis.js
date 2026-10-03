/**
 * G4.8 — Optional LLM synthesis over summaries (not full SRS).
 */

async function runSynthesis(opts = {}) {
  const policy = opts.policy || {};
  const generate = opts.generateJson;
  if (!policy.enabled || policy.maxCalls === 0) {
    return {
      ok: true,
      skipped: true,
      summary: null,
      llmCalls: 0,
      evalCount: 0,
      durationMs: 0,
      promptChars: 0,
      skipReason: 'disabled',
    };
  }
  const payload = {
    candidateCounts: opts.counts || {},
    semanticCount: (opts.semanticItems || []).length,
    conflictCount: (opts.conflicts || []).length,
    toolFacts: opts.toolFacts || {},
    openAmbiguities: (opts.ambiguities || []).slice(0, 20),
  };
  const prompt = [
    'Synthesize Requirement Understanding summary as JSON only.',
    'Schema: { "understanding", "capabilities":[], "openQuestions":[], "gaps":[], "crossModule":[] }',
    'Do not invent effort/schedule. Use only provided summaries.',
    JSON.stringify(payload),
  ].join('\n');

  const t0 = Date.now();
  const result = await generate({
    prompt,
    numPredict: policy.maxOutputTokens || 768,
    numCtx: policy.numCtx || 4096,
    timeoutMs: policy.timeoutMs || 60_000,
    env: opts.env,
  });
  const durationMs = Math.max(0, Date.now() - t0);
  const evalCount = Number(result.usage?.evalCount) || 0;
  const promptChars = prompt.length;
  if (!result.ok || result.skipped) {
    return {
      ok: false,
      skipped: Boolean(result.skipped),
      summary: null,
      error: result.error || 'ollama_error',
      llmCalls: result.skipped ? 0 : 1,
      evalCount,
      durationMs,
      promptChars,
    };
  }
  return {
    ok: true,
    skipped: false,
    summary: result.data,
    llmCalls: 1,
    evalCount,
    durationMs,
    promptChars,
  };
}

module.exports = {
  runSynthesis,
};
