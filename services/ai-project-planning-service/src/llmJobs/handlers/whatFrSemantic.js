/**
 * what.fr.* handlers — FR pipeline SoT is whatPhaseGraph frUnderstanding.
 * Job handler may use allowStandaloneFrGraph / invokeFn for tests only.
 */

const { JOB_TYPES } = require('../llmJobContract');

async function runFrUnderstandingFromJob(job, opts = {}) {
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

  if (opts.allowStandaloneFrGraph !== true) {
    const err = new Error(
      'what.fr.* jobs must not standalone-invoke FR graph; use whatPhaseGraph frUnderstanding (or allowStandaloneFrGraph for tests).'
    );
    err.code = 'PHASE_GRAPH_ONLY';
    throw err;
  }

  const { invokeFrUnderstandingStandalone } = require('../../engines/frUnderstanding');
  const out = await invokeFrUnderstandingStandalone({
    snapshot,
    pack: payload.pack || ctx.pack || {},
    env: opts.env || process.env,
    generateJsonFn: opts.generateJsonFn,
    forceHeuristic: payload.forceHeuristic === true,
    skipLlm: payload.skipLlm === true,
    priorPartial:
      payload.priorPartial ||
      payload.understandingPartial ||
      ctx.priorPartial ||
      ctx.understandingPartial ||
      null,
    allowStandaloneFrGraph: true,
  });
  return {
    ok: true,
    annotation: 'llm_proposal',
    functionalRequirements: out?.functionalRequirements || [],
    frUnderstanding: out?.frUnderstanding || out || null,
    selection: out?.selection || null,
  };
}

async function handleWhatFrSemantic(job, opts = {}) {
  return runFrUnderstandingFromJob(job, opts);
}

async function handleWhatFrConflict(job, opts = {}) {
  return runFrUnderstandingFromJob(job, { ...opts, stage: 'conflict' });
}

async function handleWhatFrSynthesis(job, opts = {}) {
  return runFrUnderstandingFromJob(job, { ...opts, stage: 'synthesis' });
}

handleWhatFrSemantic.jobType = JOB_TYPES.WHAT_FR_SEMANTIC;
handleWhatFrConflict.jobType = JOB_TYPES.WHAT_FR_CONFLICT;
handleWhatFrSynthesis.jobType = JOB_TYPES.WHAT_FR_SYNTHESIS;

module.exports = {
  handleWhatFrSemantic,
  handleWhatFrConflict,
  handleWhatFrSynthesis,
  runFrUnderstandingFromJob,
};
