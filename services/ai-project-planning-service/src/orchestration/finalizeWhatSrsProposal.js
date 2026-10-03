/**
 * After FR/G4: Analysis engines → derive (produce) → metaGate (check) → srsProposal.
 */

const { runAnalysisEnginePipeline } = require('./buildAnalysisEngineGraph');

/**
 * @param {{
 *   proposalFragment?: object,
 *   pack?: object,
 *   snapshot?: object,
 *   rawRecord?: object,
 *   runId?: string,
 *   env?: NodeJS.ProcessEnv,
 *   onProgress?: Function,
 *   invokeFn?: Function,
 * }} opts
 */
async function finalizeWhatSrsProposal(opts = {}) {
  const out = await runAnalysisEnginePipeline({
    proposalFragment: opts.proposalFragment || null,
    pack: opts.pack || {},
    snapshot: opts.snapshot || null,
    rawRecord: opts.rawRecord || null,
    skipFrIfPresent: true,
    env: opts.env || process.env,
    onProgress: opts.onProgress,
    invokeFn: opts.invokeFn,
    g4Understanding: opts.g4Understanding || null,
    evidence: opts.evidence || null,
  });

  if (opts.runId && out.proposal) {
    out.proposal.generationId = String(opts.runId);
  }

  return {
    srsProposal: out.proposal,
    resultsById: out.resultsById,
    executionOrder: out.executionOrder,
    layers: out.layers,
    semanticStatuses: out.semanticStatuses,
  };
}

module.exports = { finalizeWhatSrsProposal };
