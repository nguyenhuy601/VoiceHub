const { getTool, listTools } = require('../registry/toolRegistry');

/**
 * G17 Intelligence Runtime — model/skill/prompt/tool-call parse.
 * Does NOT compute business metrics; does NOT hit DB.
 */

function selectModel(env = process.env) {
  const primary = String(env.OLLAMA_MODEL || '').trim() || 'qwen2.5:3b-instruct';
  const fallback =
    String(env.OLLAMA_FALLBACK_MODEL || '').trim() || primary;
  const baseUrl = String(env.OLLAMA_BASE_URL || '').trim() || 'http://ollama:11434';
  return { model: primary, fallbackModel: fallback, baseUrl };
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
 * High-level stub invoke — no HTTP to Ollama in Wave B (keeps unit tests offline).
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
    // Explicit: runtime never writes business metrics
    businessMetrics: null,
  };
}

module.exports = {
  selectModel,
  loadSkillStub,
  assemblePromptStub,
  validateStructuredOutput,
  parseToolCalls,
  runIntelligenceStub,
};
