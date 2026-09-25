/**
 * G7 Context Assembly — thin wrapper over runG7Pipeline (compat for G8 callers).
 * Prefer assembleContextPackageAsync when G7_RAG_MODE is qdrant|hybrid.
 */

const { runG7Pipeline, runG7PipelineSync } = require('./runG7Pipeline');
const { getG7RagMode } = require('./g7PipelineSchemas');

/**
 * Sync assembly for stub/keyword/off (default Wave C/D until qdrant enabled).
 */
function assembleContextPackage(input = {}) {
  const mode = input.mode || getG7RagMode(input.env || process.env);
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
  const pkg = runG7PipelineSync(input);
  const { steps, ...rest } = pkg;
  void steps;
  return rest;
}

async function assembleContextPackageAsync(input = {}) {
  const pkg = await runG7Pipeline(input);
  const { steps, ...rest } = pkg;
  void steps;
  return rest;
}

module.exports = {
  assembleContextPackage,
  assembleContextPackageAsync,
};
