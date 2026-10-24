/**
 * Canonical hash for one HOW generateJson request.
 * Same jobType, model, prompt version, decode budget, temperature, and prompt → same hex.
 */

const crypto = require('crypto');

const HOW_ARTIFACT_SCHEMA_VERSION = 'how-artifact-v1';
const HOW_ARTIFACT_PROMPT_VERSION = 'p1';

function normNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hashFields(input = {}) {
  return {
    jobType: String(input.jobType || ''),
    model: String(input.model || ''),
    promptVersion: String(input.promptVersion || HOW_ARTIFACT_PROMPT_VERSION),
    numPredict: normNumber(input.numPredict),
    numCtx: normNumber(input.numCtx),
    temperature: normNumber(input.temperature),
    prompt: String(input.prompt || ''),
  };
}

function canonicalHashJson(input = {}) {
  const fields = hashFields(input);
  const sorted = {};
  for (const key of Object.keys(fields).sort()) {
    sorted[key] = fields[key];
  }
  return JSON.stringify(sorted);
}

function hashArtifactInput(input = {}) {
  return crypto.createHash('sha256').update(canonicalHashJson(input)).digest('hex');
}

module.exports = {
  HOW_ARTIFACT_SCHEMA_VERSION,
  HOW_ARTIFACT_PROMPT_VERSION,
  canonicalHashJson,
  hashArtifactInput,
};
