/**
 * @deprecated Legacy FR→Epic/Feature/Story=FR hierarchy heuristic removed (HARD-02).
 * Product path: `proposeWbsTasksWithLlm` / `runWbsEngineAsync` (Gate1 Story SoT).
 */

const { isHowWbsLlmFlagOn } = require('../contracts/howWbsLlmContract');
const { isLlmEnabled } = require('../runtime/ollamaGenerate');

const REMOVED_META = Object.freeze({
  source: 'llm_failed',
  fallbackReason: 'legacy_fr_hierarchy_heuristic_removed',
  reasonCodes: ['use_proposeWbsTasksWithLlm_story_sot'],
  llmCalls: 0,
});

function isHowWbsLlmEnabled(env = process.env) {
  return isHowWbsLlmFlagOn(env) && isLlmEnabled(env);
}

function warnFallback() {
  /* no-op — legacy */
}

async function decomposeWbsWithLlmOnce() {
  return { ok: false, tasks: [], wbs: null, meta: { ...REMOVED_META } };
}

async function decomposeWbsWithLlm() {
  return { ok: false, tasks: [], wbs: null, meta: { ...REMOVED_META } };
}

function buildWbsLlmPrompt() {
  return '';
}

module.exports = {
  buildWbsLlmPrompt,
  decomposeWbsWithLlm,
  decomposeWbsWithLlmOnce,
  isHowWbsLlmEnabled,
  isHowWbsLlmFlagOn,
  warnFallback,
};
