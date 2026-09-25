/**
 * Tool Registry — register / get / execute with standard descriptor + input envelope.
 */

const { hashInput, makeToolResult, makeWarning, makeEvidence } = require('./toolContract');
const {
  normalizeToolDescriptor,
  assertRequiredDataKeys,
} = require('./toolDescriptor');
const { normalizeToolInput } = require('./normalizeToolInput');

function createToolRegistry() {
  const tools = new Map();

  function register(descriptor) {
    const normalized = normalizeToolDescriptor(descriptor);
    tools.set(normalized.name, normalized);
    for (const alias of normalized.aliases) {
      tools.set(alias, normalized);
    }
    return normalized;
  }

  function get(name) {
    return tools.get(String(name)) || null;
  }

  function list() {
    const seen = new Set();
    const out = [];
    for (const [key, desc] of tools.entries()) {
      if (seen.has(desc.name)) continue;
      if (key !== desc.name) continue;
      seen.add(desc.name);
      out.push({
        name: desc.name,
        version: desc.version,
        versionLabel: desc.versionLabel,
        algorithmVersion: desc.algorithmVersion,
        purpose: desc.purpose,
        invocationMode: desc.invocationMode,
        dependsOn: desc.dependsOn,
        algorithm: desc.algorithm,
        contextImpact: desc.contextImpact,
        input: desc.input,
        outputKeys: desc.outputKeys,
        requiredContext: desc.requiredContext,
        requiredData: desc.requiredData,
        aliases: desc.aliases,
      });
    }
    return out;
  }

  /**
   * @param {string} name
   * @param {object} input — envelope {data,context,policy} or legacy flat
   * @param {{ factStore?: object, context?: object, allowedModes?: string[], performanceNow?: () => number }} opts
   */
  function execute(name, input, opts = {}) {
    const desc = get(name);
    if (!desc) {
      const err = new Error(`Unknown tool: ${name}`);
      err.code = 'UNKNOWN_TOOL';
      err.statusCode = 400;
      throw err;
    }

    const allowedModes = Array.isArray(opts.allowedModes)
      ? opts.allowedModes
      : ['recipe', 'on_demand', 'validation'];
    if (!allowedModes.includes(desc.invocationMode)) {
      const err = new Error(
        `Tool ${desc.name} mode ${desc.invocationMode} not allowed (allowed: ${allowedModes.join(',')})`
      );
      err.code = 'MODE_NOT_ALLOWED';
      err.statusCode = 403;
      throw err;
    }

    const factStore = opts.factStore || null;
    if (desc.dependsOn.length && factStore) {
      const missing = desc.dependsOn.filter((k) => !factStore.has(k));
      if (missing.length) {
        const err = new Error(`Missing dependsOn facts: ${missing.join(', ')}`);
        err.code = 'MISSING_DEPENDS_ON';
        err.statusCode = 422;
        err.details = { missing };
        throw err;
      }
    } else if (desc.dependsOn.length && !factStore) {
      const err = new Error(`Tool ${desc.name} requires factStore for dependsOn`);
      err.code = 'MISSING_FACT_STORE';
      err.statusCode = 422;
      throw err;
    }

    const normalizedInput = normalizeToolInput(input, opts.context);
    const missingData = assertRequiredDataKeys(desc, normalizedInput.data);
    // Soft: only enforce when descriptor lists required data keys and caller used envelope
    // For recipe tools, empty fr[] is still "present". Missing key fails.
    if (missingData.length) {
      const err = new Error(`Missing required data keys: ${missingData.join(', ')}`);
      err.code = 'MISSING_REQUIRED_DATA';
      err.statusCode = 422;
      err.details = { missing: missingData };
      throw err;
    }

    for (const key of desc.input.context || []) {
      if (
        normalizedInput.context[key] === undefined ||
        normalizedInput.context[key] === null
      ) {
        // context keys on descriptor are advisory unless also in requiredContext legacy
        if ((desc.requiredContext || []).includes(key)) {
          const err = new Error(`Missing requiredContext: ${key}`);
          err.code = 'MISSING_CONTEXT';
          err.statusCode = 422;
          throw err;
        }
      }
    }

    const inputHash = hashInput(normalizedInput);
    const nowFn =
      typeof opts.performanceNow === 'function'
        ? opts.performanceNow
        : () => (typeof performance !== 'undefined' ? performance.now() : 0);
    const t0 = nowFn();

    // Compat: legacy tools read input.fr; standard tools read input.data.fr
    const runInput = {
      ...normalizedInput.data,
      data: normalizedInput.data,
      context: normalizedInput.context,
      policy: normalizedInput.policy,
    };

    const runCtx = {
      context: normalizedInput.context,
      factStore,
      tool: desc.name,
      version: desc.version,
      versionLabel: desc.versionLabel,
      algorithmVersion: desc.algorithmVersion,
      inputHash,
      policy: normalizedInput.policy,
    };

    let result;
    try {
      result = desc.run(runInput, runCtx);
    } catch (e) {
      const durationMs = Math.max(0, nowFn() - t0);
      return makeToolResult({
        data: null,
        facts: [],
        warnings: [
          makeWarning({
            code: 'TOOL_RUN_ERROR',
            severity: 'error',
            message: e.message || 'Tool run failed',
          }),
        ],
        tool: desc.name,
        version: desc.version,
        inputHash,
        durationMs,
        evidence: makeEvidence({
          toolVersion: desc.versionLabel,
          inputHash,
          policyVersion:
            normalizedInput.policy.policyVersion || normalizedInput.policy.version || null,
        }),
      });
    }

    const durationMs = Math.max(0, nowFn() - t0);
    if (!result || typeof result !== 'object') {
      return makeToolResult({
        data: null,
        facts: [],
        warnings: [
          makeWarning({
            code: 'EMPTY_RESULT',
            severity: 'error',
            message: 'Tool returned empty result',
          }),
        ],
        tool: desc.name,
        version: desc.version,
        inputHash,
        durationMs,
        evidence: makeEvidence({ toolVersion: desc.versionLabel, inputHash }),
      });
    }

    const policyVersion =
      normalizedInput.policy.policyVersion ||
      normalizedInput.policy.version ||
      result.evidence?.policyVersion ||
      null;

    const sourceIds =
      result.evidence?.sourceIds ||
      (Array.isArray(normalizedInput.data.fr)
        ? normalizedInput.data.fr.map((f) => f.id).filter(Boolean).slice(0, 50)
        : []);

    const evidence = makeEvidence({
      sourceIds,
      formula: result.evidence?.formula || null,
      policyVersion,
      dataSnapshot: result.evidence?.dataSnapshot || null,
      toolVersion: desc.versionLabel,
      inputHash: result.meta?.inputHash || inputHash,
    });

    const toolResult = {
      data: result.data ?? null,
      facts: Array.isArray(result.facts) ? result.facts : [],
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      evidence,
      meta: {
        tool: desc.name,
        version: desc.version,
        versionLabel: desc.versionLabel,
        algorithmVersion: desc.algorithmVersion,
        purpose: desc.purpose,
        inputHash: result.meta?.inputHash || inputHash,
        durationMs: result.meta?.durationMs ?? durationMs,
        factCount: Array.isArray(result.facts) ? result.facts.length : 0,
        warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
        alias: name !== desc.name ? String(name) : undefined,
      },
    };

    if (factStore) {
      factStore.putFacts(toolResult.facts, {
        tool: desc.name,
        inputHash: toolResult.meta.inputHash,
      });
    }

    return toolResult;
  }

  return { register, get, list, execute, _tools: tools };
}

module.exports = { createToolRegistry };
