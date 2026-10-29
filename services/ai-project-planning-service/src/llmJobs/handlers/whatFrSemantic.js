/**
 * what.fr.* handlers — FR SoT is WhatFrTool semantic section (frSectionHooks).
 * Legacy conflict/synthesis job types redirect to the same one-shot derive.
 */

const { JOB_TYPES } = require('../llmJobContract');

async function runFrSemanticFromJob(job, opts = {}) {
  const payload = job.payload || {};
  if (typeof opts.invokeFn === 'function') {
    return opts.invokeFn({
      jobType: job.jobType,
      contextRef: job.contextRef,
      payload,
      generateJsonFn: opts.generateJsonFn,
    });
  }

  const { loadContextPackage } = require('../graph/persistContextPackage');
  const ctx = loadContextPackage(job.contextRef, opts.env || process.env) || {};
  const snapshot = payload.snapshot || ctx.snapshot || null;
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      ok: true,
      stub: true,
      functionalRequirements: [],
      annotation: 'llm_proposal',
    };
  }

  const { runFrSectionDerive } = require('../../semantic/frSectionHooks');
  const out = await runFrSectionDerive({
    snapshot,
    pack: payload.pack || ctx.pack || {},
    env: opts.env || process.env,
    generateJsonFn: opts.generateJsonFn,
    frOpts: {
      forceHeuristic: payload.forceHeuristic === true,
      skipLlm: payload.skipLlm === true,
      priorPartial:
        payload.priorPartial ||
        payload.understandingPartial ||
        ctx.priorPartial ||
        ctx.understandingPartial ||
        null,
    },
    runId: job.id || job.jobId || null,
  });

  return {
    ok: true,
    annotation: 'llm_proposal',
    functionalRequirements: out?.proposalFragment?.items || out?.items || [],
    frUnderstanding: out?.frUnderstanding || out?.semanticOutput || null,
    proposalFragment: out?.proposalFragment || null,
    meta: { ...(out?.meta || {}), redirectedFrom: job.jobType },
  };
}

async function handleWhatFrSemantic(job, opts = {}) {
  return runFrSemanticFromJob(job, opts);
}

/** @deprecated conflict stage removed — same semantic FR derive. */
async function handleWhatFrConflict(job, opts = {}) {
  return runFrSemanticFromJob(job, opts);
}

/** @deprecated synthesis stage removed — same semantic FR derive. */
async function handleWhatFrSynthesis(job, opts = {}) {
  return runFrSemanticFromJob(job, opts);
}

handleWhatFrSemantic.jobType = JOB_TYPES.WHAT_FR_SEMANTIC;
handleWhatFrConflict.jobType = JOB_TYPES.WHAT_FR_CONFLICT;
handleWhatFrSynthesis.jobType = JOB_TYPES.WHAT_FR_SYNTHESIS;

module.exports = {
  handleWhatFrSemantic,
  handleWhatFrConflict,
  handleWhatFrSynthesis,
  runFrSemanticFromJob,
};
