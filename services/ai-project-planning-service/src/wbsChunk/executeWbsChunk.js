/**
 * One chunk: LLM call and JSON accept. FR the model skips stay uncovered.
 * Does not choose the next planning tool.
 */

const { generateJson } = require('../runtime/ollamaGenerate');
const { cachedGenerateJson } = require('../artifacts/cachedGenerateJson');
const {
  resolveWbsLlmNumPredict,
  resolveWbsLlmNumCtx,
  resolveWbsLlmTimeoutMs,
} = require('../contracts/howWbsLlmContract');
const {
  acceptWbsStoryTasks,
  buildWbsStoryLlmPrompt,
} = require('../engines/wbsProposeLlm');

function coveredFrIds(leaves) {
  const ids = new Set();
  for (const leaf of leaves || []) {
    const frId = String(leaf?.sourceFrIds?.[0] || '').trim();
    if (frId) ids.add(frId);
  }
  return ids;
}

/**
 * @param {object} input chunk input stored on the work unit
 * @param {{ env?: object, generateJsonFn?: Function }} [opts]
 */
async function executeWbsChunk(input = {}, opts = {}) {
  const env = opts.env || process.env;
  const frUnits = Array.isArray(input.frUnits) ? input.frUnits : [];
  const stories = Array.isArray(input.stories) ? input.stories : [];
  const epics = Array.isArray(input.epics) ? input.epics : [];
  const idPrefix = String(input.idPrefix || 'c0');
  const roleAllowList = Array.isArray(input.roleAllowList) ? input.roleAllowList : null;
  const gen = typeof opts.generateJsonFn === 'function' ? opts.generateJsonFn : generateJson;
  const numCtx = resolveWbsLlmNumCtx(env);
  const timeoutMs = resolveWbsLlmTimeoutMs(env);
  let llmCalls = 0;
  let promptChars = 0;
  let model = null;

  async function runSlice(slice, prefix) {
    const prompt = buildWbsStoryLlmPrompt({
      frUnits: slice,
      stories,
      epics,
      semantic: input.semantic || null,
      localeInstruction: input.localeInstruction || '',
      roleAllowList,
    });
    promptChars += prompt.length;
    const numPredict = resolveWbsLlmNumPredict(slice.length, env);
    let llmResult;
    try {
      llmResult = await cachedGenerateJson({
        prompt,
        numPredict,
        numCtx,
        timeoutMs,
        temperature: 0.1,
        env,
        jobType: 'wbs',
        generateJsonFn: gen,
      });
    } catch (err) {
      llmCalls += 1;
      return { ok: false, retryable: true, reason: String(err?.message || err || 'llm_throw') };
    }
    if (!llmResult?.cacheHit) llmCalls += 1;
    model = llmResult?.model || model;
    if (!llmResult?.ok || llmResult.data == null) {
      return { ok: false, retryable: true, reason: llmResult?.error || 'llm_failed' };
    }
    const accepted = acceptWbsStoryTasks(llmResult.data, stories, {
      frUnits: slice,
      epics,
      semantic: input.semantic || null,
      roleAllowList,
      requireChunkEnvelope: true,
    });
    if (!accepted.ok) {
      return {
        ok: false,
        retryable: true,
        reason: (accepted.errors || ['contract_fail']).join(';').slice(0, 400),
      };
    }
    return {
      ok: true,
      tasks: accepted.tasks.map((leaf) => ({ ...leaf, id: `${prefix}-${leaf.id}` })),
    };
  }

  const first = await runSlice(frUnits, idPrefix);
  if (!first.ok) {
    return {
      ok: false,
      retryable: first.retryable !== false,
      reason: first.reason,
      llmCalls,
      promptChars,
      model,
    };
  }

  const tasks = [...first.tasks];
  const isolatedFrIds = [];
  const covered = coveredFrIds(tasks);
  const missing = frUnits.filter((unit) => unit?.id && !covered.has(unit.id));
  if (missing.length) {
    const one = await runSlice(missing, `${idPrefix}f`);
    if (one.ok) tasks.push(...one.tasks);
    const now = coveredFrIds(tasks);
    for (const unit of missing) {
      if (now.has(unit.id)) continue;
      isolatedFrIds.push(unit.id);
    }
  }

  return {
    ok: true,
    tasks,
    isolatedFrIds,
    llmCalls,
    promptChars,
    model,
    inputSnapshotId: input.inputSnapshotId || null,
  };
}

module.exports = { executeWbsChunk };
