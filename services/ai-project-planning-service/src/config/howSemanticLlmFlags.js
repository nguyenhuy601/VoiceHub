/**
 * HOW Phase — which tools use LLM vs stay heuristic (policy flags, not magic in engines).
 *
 * Semantic secs are LLM-only on the phase (no engine fallback).
 * Heuristic kept on the phase: ScheduleTool (lịch + sprint timebox).
 * Deploy is not a phase node.
 *
 * Master: HOW_SEMANTIC_LLM (default on). Per-section HOW_*_LLM overrides when set.
 */

const { isLlmEnabled } = require('../runtime/ollamaGenerate');

const SEMANTIC_SECTION_KEYS = Object.freeze([
  'backlog',
  'wbs',
  'architecture',
  'dependency',
  'risk',
  'quality',
]);

const HEURISTIC_ONLY_TOOLS = Object.freeze(['ScheduleTool']);

const ENV_BY_SECTION = Object.freeze({
  backlog: 'HOW_BACKLOG_LLM',
  wbs: 'HOW_WBS_LLM',
  architecture: 'HOW_ARCH_LLM',
  dependency: 'HOW_DEP_LLM',
  risk: 'HOW_RISK_LLM',
  quality: 'HOW_QUALITY_LLM',
});

function parseTriState(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(v)) return true;
  if (['0', 'false', 'off', 'no'].includes(v)) return false;
  return null;
}

function isHowSemanticMasterOn(env = process.env) {
  const tri = parseTriState(env.HOW_SEMANTIC_LLM);
  if (tri != null) return tri;
  // Default ON when planning LLM runtime is enabled (product: semantic HOW secs).
  return isLlmEnabled(env);
}

/**
 * @param {'backlog'|'wbs'|'architecture'|'dependency'|'risk'|'quality'} section
 * @param {NodeJS.ProcessEnv} [env]
 */
function isHowSemanticSectionLlmOn(section, env = process.env) {
  if (!isLlmEnabled(env)) return false;
  const envKey = ENV_BY_SECTION[section];
  if (!envKey) return false;
  const tri = parseTriState(env[envKey]);
  if (tri != null) return tri;
  return isHowSemanticMasterOn(env);
}

function resolveHowSemanticLlmFlags(env = process.env) {
  const master = isHowSemanticMasterOn(env);
  const runtime = isLlmEnabled(env);
  const sections = {};
  for (const key of SEMANTIC_SECTION_KEYS) {
    sections[key] = isHowSemanticSectionLlmOn(key, env);
  }
  return {
    runtimeLlmEnabled: runtime,
    master,
    sections,
    heuristicOnlyTools: [...HEURISTIC_ONLY_TOOLS],
  };
}

module.exports = {
  SEMANTIC_SECTION_KEYS,
  HEURISTIC_ONLY_TOOLS,
  ENV_BY_SECTION,
  parseTriState,
  isHowSemanticMasterOn,
  isHowSemanticSectionLlmOn,
  resolveHowSemanticLlmFlags,
};
