/**
 * Validate / normalize ToolDescriptor to the standard envelope.
 */

function formatToolVersion(version) {
  if (typeof version === 'string' && version.trim()) {
    const s = version.trim();
    return s.startsWith('v') || s.startsWith('V') ? s : `v${s}`;
  }
  const n = Number(version);
  if (Number.isFinite(n) && n > 0) return `v${n}`;
  return 'v1';
}

function parseVersionNumber(version) {
  if (typeof version === 'number' && Number.isFinite(version)) return version;
  const m = String(version || '1').match(/(\d+)/);
  return m ? Number(m[1]) : 1;
}

/**
 * @param {object} descriptor
 * @returns {object} normalized descriptor
 */
function normalizeToolDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    const err = new Error('Invalid ToolDescriptor');
    err.code = 'INVALID_DESCRIPTOR';
    throw err;
  }
  if (!descriptor.name || typeof descriptor.run !== 'function') {
    const err = new Error('Invalid ToolDescriptor: name and run required');
    err.code = 'INVALID_DESCRIPTOR';
    throw err;
  }
  if (!descriptor.purpose || !String(descriptor.purpose).trim()) {
    const err = new Error(`ToolDescriptor ${descriptor.name}: purpose required`);
    err.code = 'INVALID_DESCRIPTOR';
    throw err;
  }
  if (!Array.isArray(descriptor.algorithm) || descriptor.algorithm.length === 0) {
    const err = new Error(`ToolDescriptor ${descriptor.name}: algorithm[] required`);
    err.code = 'INVALID_DESCRIPTOR';
    throw err;
  }

  const input = descriptor.input && typeof descriptor.input === 'object' ? descriptor.input : {};
  const inputData = Array.isArray(input.data) ? input.data.map(String) : [];
  const inputContext = Array.isArray(input.context) ? input.context.map(String) : [];
  const inputPolicy = Array.isArray(input.policy) ? input.policy.map(String) : [];

  // Back-compat: requiredData / requiredContext → input.*
  const requiredData = Array.isArray(descriptor.requiredData)
    ? descriptor.requiredData.map(String)
    : inputData;
  const requiredContext = Array.isArray(descriptor.requiredContext)
    ? descriptor.requiredContext.map(String)
    : inputContext;

  const versionLabel = formatToolVersion(descriptor.version);
  const versionNum = parseVersionNumber(descriptor.version);

  return {
    name: String(descriptor.name),
    version: versionNum,
    versionLabel,
    algorithmVersion:
      Number(descriptor.algorithmVersion) || versionNum,
    purpose: String(descriptor.purpose).trim(),
    deterministic: descriptor.deterministic !== false,
    llmCalls: Number(descriptor.llmCalls) || 0,
    invocationMode: descriptor.invocationMode || 'recipe',
    dependsOn: Array.isArray(descriptor.dependsOn) ? descriptor.dependsOn.map(String) : [],
    algorithm: descriptor.algorithm.map(String),
    contextImpact:
      descriptor.contextImpact && typeof descriptor.contextImpact === 'object'
        ? descriptor.contextImpact
        : {},
    input: {
      data: requiredData.length ? requiredData : inputData,
      context: requiredContext.length ? requiredContext : inputContext,
      policy: inputPolicy,
    },
    requiredData: requiredData.length ? requiredData : inputData,
    requiredContext: requiredContext.length ? requiredContext : inputContext,
    outputKeys: Array.isArray(descriptor.outputKeys)
      ? descriptor.outputKeys.map(String)
      : [],
    aliases: Array.isArray(descriptor.aliases) ? descriptor.aliases.map(String) : [],
    run: descriptor.run,
  };
}

function assertRequiredDataKeys(desc, data) {
  const missing = [];
  for (const key of desc.input.data || []) {
    // Presence of key is enough (may be empty array)
    if (data == null || !(key in data)) missing.push(key);
  }
  return missing;
}

module.exports = {
  normalizeToolDescriptor,
  formatToolVersion,
  parseVersionNumber,
  assertRequiredDataKeys,
};
