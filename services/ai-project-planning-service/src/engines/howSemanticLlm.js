/**
 * Shared HOW semantic LLM invoke — compact JSON, always fallible → caller keeps heuristic.
 * Provider: same as WBS/WHAT — `generateJson` → DashScope when
 * LLM_PROVIDER=openai_compatible|dashscope (not Ollama /api/generate).
 */

const { generateJson, isLlmEnabled, ollamaModel } = require('../runtime/ollamaGenerate');
const { cachedGenerateJson } = require('../artifacts/cachedGenerateJson');
const { QWEN_PLUS_MAX_OUTPUT_TOKENS } = require('@enterprise/shared/llm/openaiCompatibleClient');
const { clampOutputTokens } = require('../runtime/modelOutputBudget');

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_NUM_PREDICT = QWEN_PLUS_MAX_OUTPUT_TOKENS;

function clip(s, max = 120) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function acceptanceLines(row, maxItems = 2, maxChars = 80) {
  const raw =
    row?.acceptanceCriteriaList ||
    row?.acceptanceCriteria ||
    row?.ac ||
    row?.acs ||
    row?.acceptance;
  const lines = [];
  const push = (text) => {
    const c = clip(text, maxChars);
    if (c) lines.push(c);
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (lines.length >= maxItems) break;
      if (typeof item === 'string') push(item);
      else push(item?.text || item?.statement || item?.description || '');
    }
  } else if (typeof raw === 'string' && raw.trim()) {
    for (const part of raw.split(/\n|;/)) {
      if (lines.length >= maxItems) break;
      push(part);
    }
  }
  return lines;
}

/**
 * Serialize one canonical or source row. Does not decide which rows or fields to drop.
 * @param {'fr'|'uc'} kind
 */
function requirementBriefRow(row = {}, index = 0, kind = 'fr') {
  const id =
    kind === 'uc'
      ? String(row.externalId || row.ucKey || row.id || row.entityId || `UC-${index + 1}`).trim()
      : String(row.externalId || row.id || row.entityId || `FR-${index + 1}`).trim();
  const content = row.content && typeof row.content === 'object' ? row.content : null;
  const title = String(content?.title || row.title || row.name || row.statement || '').trim();
  const statement = String(
    content?.description || row.statement || row.description || row.detail || row.summary || ''
  ).trim();
  const moduleName = String(content?.moduleId || row.module || row.moduleName || row.moduleLabel || '').trim();
  const feature = String(content?.feature || row.feature || row.featureName || row.featureLabel || '').trim();
  const ac = kind === 'fr'
    ? (content?.acceptanceCriteria || []).map((item) => item.text).filter(Boolean).length
      ? content.acceptanceCriteria.map((item) => item.text)
      : acceptanceLines(row, 100, 20000)
    : [];
  const out = { id };
  if (title) out.title = title;
  if (statement && statement !== title) out.statement = statement;
  if (moduleName) out.module = moduleName;
  if (feature && feature !== moduleName) out.feature = feature;
  if (ac.length) out.ac = ac;
  return out;
}

function packBrief(pack = {}) {
  const { compileContext } = require('../dataPlane/compileContext');
  const compiled = compileContext({
    phase: 'HOW',
    profile: 'HOW_BACKLOG_MAP',
    pack,
  });
  const frs = [];
  const ucs = [];
  for (const unit of compiled.workUnits || []) {
    for (const row of unit.entities?.functionalRequirements || []) {
      frs.push(requirementBriefRow(row, frs.length, 'fr'));
    }
    for (const row of unit.entities?.useCases || []) {
      ucs.push(requirementBriefRow(row, ucs.length, 'uc'));
    }
  }
  return {
    project: clip(pack.overview?.name || pack.name, 80),
    frs,
    ucs,
    status: compiled.status,
    coverage: compiled.coverage,
  };
}

function leafTaskBrief(container = {}) {
  return (container?.planning?.tasks || [])
    .filter((t) => {
      const level = String(t?.level || 'task').toLowerCase();
      return level === 'task' || level === 'subtask' || !t.level;
    })
    .map((t) => ({
      id: String(t.id || t.taskId || ''),
      title: clip(t.name || t.title, 80),
      area: clip(t.area, 24),
      role: clip(t.suggestedRoleKey, 32),
    }))
    .filter((t) => t.id);
}

/**
 * @returns {Promise<{ ok: boolean, data: object|null, meta: object }>}
 */
async function invokeHowSemanticLlm({
  system,
  user,
  env = process.env,
  generateJsonFn = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  numPredict = DEFAULT_NUM_PREDICT,
  numCtx,
} = {}) {
  if (!isLlmEnabled(env)) {
    return { ok: false, data: null, meta: { fallbackReason: 'llm_disabled' } };
  }
  const prompt = [String(system || '').trim(), String(user || '').trim()]
    .filter(Boolean)
    .join('\n\n');
  const predict = clampOutputTokens(numPredict, env);
  try {
    const llmOpts = {
      prompt,
      env,
      timeoutMs,
      numPredict: predict,
      temperature: 0.2,
      jobType: 'how-sec',
      generateJsonFn: generateJsonFn || generateJson,
    };
    if (numCtx != null && Number.isFinite(Number(numCtx))) llmOpts.numCtx = Number(numCtx);
    const out = await cachedGenerateJson(llmOpts);
    if (!out?.ok || !out.data || typeof out.data !== 'object') {
      return {
        ok: false,
        data: null,
        meta: {
          fallbackReason:
            out?.error || (out?.skipped ? 'llm_skipped' : 'parse_empty'),
          model: out?.model || ollamaModel(env),
        },
      };
    }
    return {
      ok: true,
      data: out.data,
      meta: {
        model: out.model || ollamaModel(env),
        llmCalls: out.cacheHit ? 0 : 1,
        usage: out.usage || null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      data: null,
      meta: {
        fallbackReason: 'llm_error',
        error: String(err?.message || err).slice(0, 160),
        model: ollamaModel(env),
      },
    };
  }
}

module.exports = {
  invokeHowSemanticLlm,
  packBrief,
  requirementBriefRow,
  acceptanceLines,
  leafTaskBrief,
  clip,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_NUM_PREDICT,
};
