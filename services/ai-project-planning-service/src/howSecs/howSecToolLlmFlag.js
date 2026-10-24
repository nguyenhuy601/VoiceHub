/**
 * HOW_SEC_TOOL_LLM — Semantic→Fact→LLM→Accept path per migrated sec (real data only).
 * Default ON when planning LLM enabled. Tools no longer fall back to heuristic engines.
 * Per-sec: HOW_SEC_TOOL_LLM_ARCHITECTURE=0|1 overrides.
 */

const { isLlmEnabled } = require('../runtime/ollamaGenerate');
const { parseTriState } = require('../config/howSemanticLlmFlags');

const SEC_ENV = Object.freeze({
  architecture: 'HOW_SEC_TOOL_LLM_ARCHITECTURE',
  dependencies: 'HOW_SEC_TOOL_LLM_DEPENDENCIES',
  effortRoles: 'HOW_SEC_TOOL_LLM_EFFORT_ROLES',
  risks: 'HOW_SEC_TOOL_LLM_RISKS',
  quality: 'HOW_SEC_TOOL_LLM_QUALITY',
  releases: 'HOW_SEC_TOOL_LLM_RELEASES',
  deploy: 'HOW_SEC_TOOL_LLM_DEPLOY',
  sprint: 'HOW_SEC_TOOL_LLM_SPRINT',
});

function isHowSecToolLlmMasterOn(env = process.env) {
  const tri = parseTriState(env.HOW_SEC_TOOL_LLM);
  if (tri != null) return tri;
  // Default ON whenever planning LLM is enabled — Architecture and peers use Tool-LLM path.
  return isLlmEnabled(env);
}

/**
 * @param {keyof typeof SEC_ENV} sec
 */
function isHowSecToolLlmOn(sec, env = process.env) {
  if (!isLlmEnabled(env)) return false;
  const key = SEC_ENV[sec];
  if (key) {
    const tri = parseTriState(env[key]);
    if (tri != null) return tri;
  }
  return isHowSecToolLlmMasterOn(env);
}

module.exports = {
  SEC_ENV,
  isHowSecToolLlmMasterOn,
  isHowSecToolLlmOn,
};
