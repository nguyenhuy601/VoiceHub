/**
 * RAG Context Assembly — thin wrapper over runRagPipeline (compat for evaluate callers).
 * Prefer assembleContextPackageAsync when RAG_MODE is qdrant|hybrid.
 */

const { runRagPipeline, runRagPipelineSync } = require('./runRagPipeline');
const { getRagMode } = require('./ragPipelineSchemas');

/**
 * Sync assembly for stub/keyword/off (default Wave C/D until qdrant enabled).
 */
function assembleContextPackage(input = {}) {
  const mode = input.mode || getRagMode(input.env || process.env);
  if (mode === 'qdrant' || mode === 'hybrid') {
    return {
      query: String(input.query || ''),
      citations: [],
      assembledAt: new Date().toISOString(),
      mode,
      intent: 'general',
      stub: true,
      _needsAsync: true,
    };
  }
  const pkg = runRagPipelineSync(input);
  const { steps, ...rest } = pkg;
  void steps;
  return rest;
}

async function assembleContextPackageAsync(input = {}) {
  const pkg = await runRagPipeline(input);
  const { steps, ...rest } = pkg;
  void steps;
  return rest;
}

module.exports = {
  assembleContextPackage,
  assembleContextPackageAsync,
};
