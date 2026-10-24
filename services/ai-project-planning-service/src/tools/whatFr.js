/**
 * FR section tool. Phase graph only invokes this tool.
 * generateJson stays inside propose helpers; merge, ids, and gates stay outside the model call.
 */

const { createEvidence } = require('../evidence/evidence');
const { WHAT_FR_TOOL } = require('../whatSecs/sectionCatalog');

async function whatFr(input = {}, context = {}) {
  const { runFrSemanticTask } = require('../semantic/runFrSemanticTask');
  const frSem = await runFrSemanticTask({
    snapshot: input.snapshot || context.snapshot,
    pack: input.pack || context.pack || {},
    g4Opts: input.g4Opts || context.g4Opts || {},
    runId: input.runId || context.runId || null,
    env: input.env || context.env || process.env,
    generateJsonFn: input.generateJsonFn || context.generateJsonFn || null,
    onProgress: input.onProgress || context.onProgress || null,
  });
  const items = frSem?.proposalFragment?.items || frSem?.items || [];
  return {
    result: frSem,
    evidence: [
      createEvidence({
        sourceType: 'requirement_analysis',
        sourceId: input.snapshotId || context.snapshotId || null,
        snapshotId: input.snapshotId || context.snapshotId || null,
        metric: 'fr_count',
        value: Array.isArray(items) ? items.length : 0,
        unit: 'count',
        calculatedBy: WHAT_FR_TOOL,
        ruleId: 'WHAT-FR-TOOL-LLM-001',
      }),
    ],
  };
}

module.exports = { whatFr };
