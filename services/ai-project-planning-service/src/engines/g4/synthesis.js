/**
 * G4.8 — Optional LLM synthesis over summaries (not full SRS).
 */

async function runSynthesis(opts = {}) {
  const policy = opts.policy || {};
  const generate = opts.generateJson;
  if (!policy.enabled || policy.maxCalls === 0) {
    return { ok: true, skipped: true, summary: null, llmCalls: 0 };
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

  const result = await generate({
    prompt,
    numPredict: policy.maxOutputTokens || 768,
    numCtx: policy.numCtx || 4096,
    timeoutMs: policy.timeoutMs || 60_000,
    env: opts.env,
  });
  if (!result.ok || result.skipped) {
    return {
      ok: false,
      skipped: Boolean(result.skipped),
      summary: null,
      error: result.error || 'ollama_error',
      llmCalls: result.skipped ? 0 : 1,
    };
  }
  return { ok: true, skipped: false, summary: result.data, llmCalls: 1 };
}

module.exports = {
  runSynthesis,
};
