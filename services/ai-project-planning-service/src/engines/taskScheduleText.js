/**
 * CPM facts stay numeric. LLM only writes the time sentence for each WBS task id.
 */

const { isLlmEnabled } = require('../runtime/ollamaGenerate');
const { invokeHowSemanticLlm } = require('./howSemanticLlm');
const { sliceByOutputBudget, clampOutputTokens } = require('../runtime/modelOutputBudget');

/** One timeText sentence per task. */
const SCHEDULE_TOKENS_PER_TASK = 80;
const { buildTaskTimingFacts } = require('./taskScheduleTiming');

function clip(value, max = 240) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function llmFacts(facts) {
  return facts.map((fact) => ({
    id: fact.id,
    title: clip(fact.title, 80),
    durationHours: fact.durationHours,
    startOffsetHours: fact.esHours,
    finishOffsetHours: fact.efHours,
    floatHours: fact.totalFloatHours,
    critical: fact.critical,
    wave: fact.wave,
    after: (fact.predecessors || []).map((row) => row.title),
    before: (fact.successors || []).map((row) => row.title),
    parallelWith: (fact.parallelWith || []).map((row) => row.title),
  }));
}

function acceptTimingTexts(raw, facts) {
  const allow = new Set(facts.map((fact) => fact.id));
  const textById = new Map();
  const rows = Array.isArray(raw?.items) ? raw.items : [];
  for (const row of rows) {
    const id = String(row?.id || row?.taskId || '').trim();
    if (!allow.has(id) || textById.has(id)) continue;
    const timeText = clip(row?.timeText || row?.text);
    if (!timeText) continue;
    textById.set(id, timeText);
  }
  return facts.flatMap((fact) => {
    const timeText = textById.get(fact.id);
    if (!timeText) return [];
    return [
      {
        taskId: fact.id,
        title: fact.title,
        timeText,
        durationHours: fact.durationHours,
        esHours: fact.esHours,
        efHours: fact.efHours,
        totalFloatHours: fact.totalFloatHours,
        critical: fact.critical,
        wave: fact.wave,
        textSource: 'llm',
      },
    ];
  });
}

async function proposeTimingTexts({ facts, locale, env, generateJsonFn, layer = null }) {
  if (!facts.length) return { ok: false, data: null, meta: { fallbackReason: 'no_leaves' } };
  if (!isLlmEnabled(env)) return { ok: false, data: null, meta: { fallbackReason: 'llm_disabled' } };
  const { languageInstruction } = require('../semantic/buildSemanticDeriveContext');
  const system = [
    'You are a project scheduling analyst. Return JSON only.',
    'For each task id in ALLOW, write one short timeText using only FACTS fields durationHours, startOffsetHours, finishOffsetHours, floatHours, critical, wave, after, before, and parallelWith.',
    'State whether the task is sequential or parallel, and whether it is on the critical path, only when those facts are present.',
    'When durationHours, a non-empty parallelWith, and critical are all present, timeText may be: "4 giờ; thực hiện song song với TASK-02; nằm trên đường găng." Do not use that pattern when any of the three is missing.',
    'If critical is absent, do not state that the task is off the critical path. If a fact is unavailable, do not guess.',
    'Do not calculate or change hours, invent calendar dates, add tasks, or alter scheduling decisions. Preserve task ids from ALLOW.',
    'Output: {"items":[{"id":"...","timeText":"..."}]}.',
    languageInstruction(locale || 'vi'),
  ].join(' ');
  const slices = sliceByOutputBudget(facts, SCHEDULE_TOKENS_PER_TASK, env);
  const items = [];
  let llmCalls = 0;
  let model = null;
  let lastFail = null;
  for (const slice of slices) {
    const user = [
      layer ? `CONTEXT=${JSON.stringify({
        status: layer.status,
        requiredData: layer.requiredData,
        supportingContext: layer.supportingContext,
        unresolvedIssues: layer.unresolvedIssues,
        allowedEntityIds: layer.allowedEntityIds,
      })}` : '',
      `FACTS=${JSON.stringify(llmFacts(slice))}`,
      `ALLOW=${JSON.stringify(slice.map((fact) => fact.id))}`,
      'Write timeText only for ALLOW ids in this call.',
      'SHAPE={"items":[{"id":"","timeText":""}]}',
    ].join('\n');
    const llm = await invokeHowSemanticLlm({
      system,
      user,
      env,
      generateJsonFn,
      numPredict: clampOutputTokens(80 + slice.length * SCHEDULE_TOKENS_PER_TASK, env),
    });
    llmCalls += llm.meta?.llmCalls || 1;
    model = llm.meta?.model || model;
    if (llm.ok && Array.isArray(llm.data?.items)) items.push(...llm.data.items);
    else lastFail = llm.meta || { fallbackReason: 'llm_failed' };
  }
  if (!items.length && lastFail) {
    return { ok: false, data: null, meta: { ...lastFail, llmCalls } };
  }
  return { ok: true, data: { items }, meta: { llmCalls, model } };
}

/**
 * @returns {Promise<{ timings: object[], container: object, meta: object }>}
 */
async function attachTaskTimingTexts({
  container,
  pack = {},
  env = process.env,
  generateJsonFn = null,
} = {}) {
  const facts = buildTaskTimingFacts(container);
  const { assembleHowToolContext, contextAllowsWork } = require('../semanticLayer/howToolContext');
  const layer = await assembleHowToolContext({
    purpose: 'SCHEDULE_TEXT',
    pack,
    container,
    env,
    contextPackage: null,
    snapshot: null,
  });
  const locale = String(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE || 'vi'
  )
    .trim()
    .toLowerCase();
  const proposed = contextAllowsWork(layer)
    ? await proposeTimingTexts({
        facts,
        locale: locale === 'en' ? 'en' : 'vi',
        env,
        generateJsonFn,
        layer,
      })
    : { ok: false, data: null, meta: { fallbackReason: layer.status || layer.code || 'semantic_incomplete' } };
  const timings = acceptTimingTexts(proposed.ok ? proposed.data : null, facts);
  const llmCount = timings.filter((row) => row.textSource === 'llm').length;
  return {
    timings,
    meta: {
      source: llmCount ? 'cpm_llm' : 'llm_unavailable',
      llmCalls: proposed.meta?.llmCalls || 0,
      fallbackReason: proposed.ok ? null : proposed.meta?.fallbackReason || null,
      taskCount: timings.length,
    },
    container: {
      ...container,
      planning: {
        ...(container?.planning || {}),
        taskTimings: timings,
      },
    },
  };
}

module.exports = {
  acceptTimingTexts,
  attachTaskTimingTexts,
  proposeTimingTexts,
};
