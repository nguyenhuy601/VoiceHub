/**
 * Completion budget for the configured chat model.
 * qwen-max rejects max_tokens above 8192. qwen-plus and qwen-flash allow 32768.
 */

const { resolveChatMaxOutputTokens } = require('@enterprise/shared/llm/openaiCompatibleClient');

function modelOutputCeiling(env = process.env) {
  return resolveChatMaxOutputTokens(env);
}

function clampOutputTokens(requested, env = process.env, min = 32) {
  const ceiling = modelOutputCeiling(env);
  const n = Number(requested);
  if (!Number.isFinite(n)) return ceiling;
  return Math.max(min, Math.min(ceiling, Math.round(n)));
}

/** How many rows fit in one completion at a reserved token cost per row. */
function rowsPerOutputCall(tokensPerRow, env = process.env, envelope = 80) {
  const ceiling = modelOutputCeiling(env);
  const per = Math.max(1, Number(tokensPerRow) || 1);
  return Math.max(1, Math.floor((Math.max(envelope + per, ceiling) - envelope) / per));
}

function sliceByOutputBudget(rows, tokensPerRow, env = process.env) {
  const list = Array.isArray(rows) ? rows : [];
  const size = rowsPerOutputCall(tokensPerRow, env);
  const slices = [];
  for (let i = 0; i < list.length; i += size) slices.push(list.slice(i, i + size));
  return slices;
}

module.exports = {
  modelOutputCeiling,
  clampOutputTokens,
  rowsPerOutputCall,
  sliceByOutputBudget,
};
