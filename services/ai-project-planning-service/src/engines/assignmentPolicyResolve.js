/**
 * Resolve Assignment Policy — cascade task → project → org → defaults.
 * Env: ASSIGNMENT_POLICY_V1 (default on), ASSIGNMENT_POLICY_PROFILE (built-in id).
 */

const path = require('path');
const {
  normalizeAssignmentPolicy,
  applyRankWeightsFallback,
} = require('../config/assignmentPolicy.schema');

let cachedDefaults = null;

function loadDefaultsJson() {
  if (cachedDefaults) return cachedDefaults;
  // eslint-disable-next-line import/no-dynamic-require, global-require
  cachedDefaults = require(path.join(__dirname, '../config/assignmentPolicy.defaults.json'));
  return cachedDefaults;
}

function envFlag(raw, defaultOn = true) {
  if (raw == null || String(raw).trim() === '') return defaultOn;
  const v = String(raw).trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(v);
}

function isAssignmentPolicyV1Enabled(env = process.env) {
  return envFlag(env.ASSIGNMENT_POLICY_V1, true);
}

function deepMergePolicyLayers(...layers) {
  const out = {
    hardGates: {},
    rankWeights: {},
    rankWeightsFallback: {},
    globalAssign: {},
    hitl: {},
  };
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    if (layer.version != null) out.version = layer.version;
    if (layer.profileId != null) out.profileId = layer.profileId;
    if (layer.hardGates && typeof layer.hardGates === 'object') {
      Object.assign(out.hardGates, layer.hardGates);
    }
    if (layer.rankWeights && typeof layer.rankWeights === 'object') {
      Object.assign(out.rankWeights, layer.rankWeights);
    }
    if (layer.rankWeightsFallback && typeof layer.rankWeightsFallback === 'object') {
      if (Array.isArray(layer.rankWeightsFallback.whenMissing)) {
        out.rankWeightsFallback.whenMissing = [...layer.rankWeightsFallback.whenMissing];
      }
      if (Array.isArray(layer.rankWeightsFallback.redistributeTo)) {
        out.rankWeightsFallback.redistributeTo = [
          ...layer.rankWeightsFallback.redistributeTo,
        ];
      }
    }
    if (layer.globalAssign && typeof layer.globalAssign === 'object') {
      Object.assign(out.globalAssign, layer.globalAssign);
    }
    if (layer.hitl && typeof layer.hitl === 'object') {
      Object.assign(out.hitl, layer.hitl);
    }
  }
  return out;
}

function pickOverride(source) {
  if (!source || typeof source !== 'object') return null;
  if (source.assignmentPolicy && typeof source.assignmentPolicy === 'object') {
    return source.assignmentPolicy;
  }
  return null;
}

/**
 * @param {{
 *   pack?: object,
 *   project?: object,
 *   org?: object,
 *   task?: object,
 *   planningHints?: object,
 *   env?: NodeJS.ProcessEnv,
 *   missingSoftKeys?: string[],
 * }} [input]
 */
function resolveAssignmentPolicy(input = {}) {
  const env = input.env || process.env;
  const defaults = loadDefaultsJson();
  const profileOverrideId = String(env.ASSIGNMENT_POLICY_PROFILE || '').trim();

  let base = { ...defaults };
  if (profileOverrideId && profileOverrideId !== defaults.profileId) {
    // Built-in profiles only for now — unknown id keeps defaults.profileId label override
    base = { ...defaults, profileId: profileOverrideId };
  }

  const orgLayer = pickOverride(input.org) || pickOverride(input.org?.settings);
  const projectLayer =
    pickOverride(input.project) ||
    pickOverride(input.project?.aiAnalysis) ||
    pickOverride(input.pack?.aiAnalysis) ||
    pickOverride(input.pack);
  const hintsLayer = pickOverride(input.planningHints);
  const taskLayer = pickOverride(input.task);

  const merged = deepMergePolicyLayers(
    base,
    orgLayer,
    projectLayer,
    hintsLayer,
    taskLayer
  );

  let policy = normalizeAssignmentPolicy(merged);
  if (Array.isArray(input.missingSoftKeys) && input.missingSoftKeys.length) {
    policy = applyRankWeightsFallback(policy, input.missingSoftKeys);
  }

  return {
    enabled: isAssignmentPolicyV1Enabled(env),
    policy,
    meta: {
      profileId: policy.profileId,
      version: policy.version,
      sourceLayers: [
        'defaults',
        orgLayer ? 'org' : null,
        projectLayer ? 'project' : null,
        hintsLayer ? 'planningHints' : null,
        taskLayer ? 'task' : null,
      ].filter(Boolean),
    },
  };
}

module.exports = {
  resolveAssignmentPolicy,
  isAssignmentPolicyV1Enabled,
  deepMergePolicyLayers,
  loadDefaultsJson,
  envFlag,
};
