const { JOB_TYPES } = require('../llmJobContract');

async function handleHowRisk(job, opts = {}) {
  const payload = job.payload || {};
  if (typeof opts.invokeFn === 'function') {
    return opts.invokeFn({
      jobType: job.jobType,
      contextRef: job.contextRef,
      factsRef: job.factsRef,
      payload,
      generateJsonFn: opts.generateJsonFn,
    });
  }

  const { loadContextPackage } = require('../graph/persistContextPackage');
  const ctx = loadContextPackage(job.contextRef, opts.env || process.env) || {};
  const system = payload.system || ctx.system;
  const user = payload.user || ctx.user;
  if (!system || !user) {
    return {
      ok: true,
      stub: true,
      risks: Array.isArray(payload.risks) ? payload.risks : [],
      facts: payload.facts || null,
      annotation: 'llm_proposal',
    };
  }

  const { invokeHowSemanticLlm } = require('../../engines/howSemanticLlm');
  const llm = await invokeHowSemanticLlm({
    system,
    user,
    env: opts.env || process.env,
    generateJsonFn: opts.generateJsonFn,
  });
  return {
    ok: Boolean(llm?.ok !== false),
    annotation: 'llm_proposal',
    risks: llm?.data?.risks || llm?.data?.items || [],
    raw: llm?.data || null,
    facts: payload.facts || null,
    error: llm?.error || null,
  };
}

handleHowRisk.jobType = JOB_TYPES.HOW_RISK;

module.exports = { handleHowRisk };
