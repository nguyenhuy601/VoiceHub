/**
 * G4 Semantic Engine adapter for FR path.
 * Candidate selection / prompt / semantic projection stay in engines/g4 (unchanged W0).
 */

const { runG4Pipeline } = require('../../engines/g4/runG4Pipeline');
const { toLegacyG4SemanticInput } = require('./legacyFrInputProjectionAdapter');

/**
 * @param {{ frInputProjection?: object, snapshot?: object, extractResult?: object, env?: object, generateJsonFn?: Function, skipLlm?: boolean, forceHeuristic?: boolean, onProgress?: Function, pauseAtDataGate?: boolean, priorPartial?: object }} opts
 */
async function runG4SemanticAnalysis(opts = {}) {
  const snapshot =
    opts.snapshot ||
    toLegacyG4SemanticInput({
      ...(opts.frInputProjection || {}),
      requirements:
        opts.extractResult?.extracted ||
        opts.frInputProjection?.requirements ||
        [],
      context: {
        ...(opts.frInputProjection?.context || {}),
        ...(opts.extractResult?.context || {}),
      },
      actors: opts.extractResult?.actors || opts.frInputProjection?.actors,
      domain: opts.extractResult?.domain || opts.frInputProjection?.domain,
      evidencePack:
        opts.extractResult?.evidencePack || opts.frInputProjection?.evidencePack,
    });

  const out = await runG4Pipeline({
    snapshot,
    pack: snapshot,
    env: opts.env,
    generateJsonFn: opts.generateJsonFn,
    skipLlm: opts.skipLlm,
    forceHeuristic: opts.forceHeuristic,
    onProgress: opts.onProgress,
    pauseAtDataGate: opts.pauseAtDataGate,
    priorPartial: opts.priorPartial,
  });

  return out;
}

module.exports = { runG4SemanticAnalysis };
