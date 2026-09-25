const { getTool, listTools } = require('../registry/toolRegistry');
const { generateJson, ollamaModel } = require('./ollamaGenerate');

/**
 * G17 Intelligence Runtime — model/skill/prompt/tool-call parse.
 * Does NOT compute business metrics; does NOT hit DB.
 * P6: timeout/budget metadata; optional JEV2 route when JEV_CONTROL=1.
 */

function selectModel(env = process.env, opts = {}) {
  const primary = ollamaModel(env);
  const fallback =
    String(env.OLLAMA_FALLBACK_MODEL || '').trim() || primary;
  const reasoning =
    String(env.OLLAMA_REASONING_MODEL || env.OLLAMA_FALLBACK_MODEL || '').trim() ||
    primary;
  const baseUrl = String(env.OLLAMA_BASE_URL || '').trim() || 'http://ollama:11434';
  const timeoutMs = Math.max(
    5000,
    Math.min(600000, Number(env.G17_LLM_TIMEOUT_MS || 120000) || 120000)
  );
  const maxTokens = Math.max(
    64,
    Math.min(8192, Number(env.G17_LLM_NUM_PREDICT || 512) || 512)
  );

  let model = primary;
  let jev2 = null;
  try {
    const {
      isJevControlEnabled,
      evaluateJev2ModelRoute,
    } = require('../orchestration/jevControl');
    if (isJevControlEnabled(env)) {
      jev2 = evaluateJev2ModelRoute({
        riskLevel: opts.riskLevel,
        complexity: opts.complexity,
      });
      if (jev2.route === 'reasoning') model = reasoning;
    }
  } catch {
    /* optional */
  }

  return {
    model,
    fallbackModel: fallback,
    reasoningModel: reasoning,
    baseUrl,
    timeoutMs,
    maxTokens,
    jev2,
  };
}

function loadSkillStub(skillPackage) {
  if (!skillPackage || !skillPackage.skillId) {
    return { loaded: false, skill: null };
  }
  return {
    loaded: true,
    skill: {
      skillId: skillPackage.skillId,
      version: skillPackage.version || '0.0.0',
      allowedToolNames: skillPackage.allowedToolNames || [],
      toolUsagePolicy: skillPackage.toolUsagePolicy || {},
    },
  };
}

function assemblePromptStub({ skill, contextPackage, objective }) {
  return {
    system: `Skill ${skill?.skillId || 'none'} v${skill?.version || '0'}`,
    user: objective || 'plan',
    contextCitations: Array.isArray(contextPackage?.citations)
      ? contextPackage.citations
      : [],
    version: 'prompt-stub-1',
  };
}

function validateStructuredOutput(payload, schema = {}) {
  if (payload == null || typeof payload !== 'object') {
    return { ok: false, errors: ['output must be object'] };
  }
  const required = Array.isArray(schema.required) ? schema.required : [];
  const errors = [];
  for (const key of required) {
    if (payload[key] === undefined) errors.push(`missing:${key}`);
  }
  return { ok: errors.length === 0, errors, value: payload };
}

/**
 * Parse LLM tool-call requests against G18 registry (validate names only).
 */
function parseToolCalls(rawCalls, { allowedToolNames } = {}) {
  const list = Array.isArray(rawCalls) ? rawCalls : [];
  const accepted = [];
  const rejected = [];
  const allow = Array.isArray(allowedToolNames) ? new Set(allowedToolNames) : null;

  for (const call of list) {
    const name = call?.toolName || call?.name;
    if (!name) {
      rejected.push({ call, reason: 'missing_name' });
      continue;
    }
    if (allow && !allow.has(name)) {
      rejected.push({ call, reason: 'not_in_skill_policy', toolName: name });
      continue;
    }
    if (!getTool(name)) {
      rejected.push({ call, reason: 'not_in_registry', toolName: name });
      continue;
    }
    accepted.push({
      toolName: name,
      arguments: call.arguments || call.input || {},
    });
  }

  return { accepted, rejected, registeredTools: listTools().map((t) => t.toolName) };
}

/**
 * High-level stub invoke — no HTTP to Ollama (keeps unit tests offline).
 */
function runIntelligenceStub(input = {}) {
  const model = selectModel(input.env || process.env);
  const skillLoad = loadSkillStub(input.skill);
  const prompt = assemblePromptStub({
    skill: skillLoad.skill,
    contextPackage: input.contextPackage,
    objective: input.objective,
  });
  const structured = validateStructuredOutput(input.structuredCandidate || { action: 'observe' }, {
    required: ['action'],
  });
  const toolCalls = parseToolCalls(input.toolCalls || [], {
    allowedToolNames: skillLoad.skill?.allowedToolNames,
  });

  return {
    model,
    skill: skillLoad,
    prompt,
    structured,
    toolCalls,
    businessMetrics: null,
    stub: true,
  };
}

/**
 * Production G17 path — uses Ollama when AI_PLANNING_LLM enabled; else stub.
 */
async function runIntelligence(input = {}) {
  const env = input.env || process.env;
  const { isLlmEnabled, llmProvider } = require('./ollamaGenerate');
  if (!isLlmEnabled(env) || llmProvider(env) === 'mock' || input.forceStub) {
    return runIntelligenceStub(input);
  }

  const model = selectModel(env);
  const skillLoad = loadSkillStub(input.skill);
  const prompt = assemblePromptStub({
    skill: skillLoad.skill,
    contextPackage: input.contextPackage,
    objective: input.objective,
  });
  const gen = await generateJson({
    prompt: `${prompt.system}\n\nObjective: ${prompt.user}\nCitations: ${prompt.contextCitations.length}`,
    temperature: 0.1,
    numPredict: model.maxTokens || 256,
    timeoutMs: model.timeoutMs,
    env,
    axiosImpl: input.axiosImpl,
  });

  const candidate =
    gen.ok && gen.data && typeof gen.data === 'object'
      ? gen.data
      : input.structuredCandidate || { action: 'observe' };
  const structured = validateStructuredOutput(candidate, {
    required: ['action'],
  });
  const toolCalls = parseToolCalls(
    Array.isArray(candidate.toolCalls) ? candidate.toolCalls : input.toolCalls || [],
    { allowedToolNames: skillLoad.skill?.allowedToolNames }
  );

  return {
    model,
    skill: skillLoad,
    prompt,
    structured,
    toolCalls,
    businessMetrics: null,
    stub: false,
    llm: { ok: Boolean(gen.ok), skipped: Boolean(gen.skipped), error: gen.error || null },
  };
}

/**
 * Invoke LLM for structured JSON via G17 ollama wrapper.
 */
async function runStructuredGenerate(opts = {}) {
  return generateJson(opts);
}

module.exports = {
  selectModel,
  loadSkillStub,
  assemblePromptStub,
  validateStructuredOutput,
  parseToolCalls,
  runIntelligenceStub,
  runIntelligence,
  runStructuredGenerate,
};
