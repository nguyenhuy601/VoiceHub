/**
 * One chunk: LLM call, contract accept, quality gate, limited repair.
 * FR the model skips stay uncovered. Does not choose the next planning tool.
 */

const { generateJson } = require('../runtime/ollamaGenerate');
const { cachedGenerateJson } = require('../artifacts/cachedGenerateJson');
const {
  resolveWbsLlmNumPredict,
  resolveWbsLlmNumCtx,
  resolveWbsLlmTimeoutMs,
  resolveWbsLlmMaxRepair,
} = require('../contracts/howWbsLlmContract');
const {
  acceptWbsStoryTasks,
  buildWbsStoryLlmPrompt,
  resolveAcRefToWhitelist,
} = require('../engines/wbsProposeLlm');
const {
  assessInputReadiness,
  assessDecompositionQuality,
  formatRepairFeedback,
} = require('../engines/wbsDecompositionQuality');

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
  const maxRepair = resolveWbsLlmMaxRepair(env);
  let llmCalls = 0;
  let promptChars = 0;
  let model = null;
  let repairAttempts = 0;
  const clarifications = [];
  const qualityIssues = [];

  const readiness = assessInputReadiness(frUnits);
  if (!readiness.ok) {
    clarifications.push(...readiness.clarifications);
    return {
      ok: false,
      retryable: false,
      needsReview: true,
      reason: 'insufficient_source',
      clarifications,
      qualityIssues,
      llmCalls,
      promptChars,
      model,
      repairAttempts,
      inputSnapshotId: input.inputSnapshotId || null,
    };
  }

  async function runSliceOnce(slice, prefix, repairFeedback) {
    const prompt = buildWbsStoryLlmPrompt({
      frUnits: slice,
      stories,
      epics,
      semantic: input.semantic || null,
      localeInstruction: input.localeInstruction || '',
      roleAllowList,
      repairFeedback,
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
        contractErrors: accepted.errors || [],
      };
    }
    const tasks = accepted.tasks.map((leaf) => ({ ...leaf, id: `${prefix}-${leaf.id}` }));
    const quality = assessDecompositionQuality({
      frUnits: slice,
      tasks,
      clarifications: accepted.clarifications || [],
      resolveAcRef: (raw, acList, frId) => resolveAcRefToWhitelist(raw, acList, { frId }),
    });
    if (accepted.clarifications?.length && (!tasks.length || !quality.ok)) {
      return {
        ok: false,
        retryable: false,
        needsReview: true,
        reason: 'clarifications_returned',
        clarifications: accepted.clarifications,
        issues: quality.issues,
        tasks,
      };
    }
    if (!quality.ok) {
      return {
        ok: false,
        retryable: true,
        reason: quality.issues.map((i) => i.code).join('|') || 'quality_fail',
        issues: quality.issues,
        clarifications: quality.clarifications,
        tasks,
        repairFeedback: formatRepairFeedback(quality),
      };
    }
    return { ok: true, tasks, clarifications: accepted.clarifications || [] };
  }

  async function runSlice(slice, prefix) {
    let feedback = null;
    let last = null;
    for (let attempt = 0; attempt <= maxRepair; attempt += 1) {
      if (attempt > 0) repairAttempts += 1;
      last = await runSliceOnce(
        slice,
        `${prefix}${attempt > 0 ? `r${attempt}` : ''}`,
        feedback
      );
      if (last.ok) return last;
      if (last.needsReview) return last;
      if (attempt >= maxRepair) break;
      feedback = last.repairFeedback || {
        instruction: 'Fix contract/quality errors.',
        issues: last.contractErrors || [{ code: 'contract_fail', message: last.reason }],
        clarifications: last.clarifications || [],
      };
    }
    return {
      ok: false,
      retryable: false,
      needsReview: true,
      reason: last?.reason || 'quality_repair_exhausted',
      issues: last?.issues || [],
      clarifications: last?.clarifications || [],
      tasks: last?.tasks || [],
    };
  }

  const first = await runSlice(frUnits, idPrefix);
  if (!first.ok && !first.tasks?.length) {
    if (first.clarifications?.length) clarifications.push(...first.clarifications);
    if (first.issues?.length) qualityIssues.push(...first.issues);
    return {
      ok: false,
      retryable: first.retryable !== false && !first.needsReview,
      needsReview: Boolean(first.needsReview),
      reason: first.reason,
      clarifications,
      qualityIssues,
      llmCalls,
      promptChars,
      model,
      repairAttempts,
      inputSnapshotId: input.inputSnapshotId || null,
    };
  }

  const tasks = [...(first.tasks || [])];
  if (first.clarifications?.length) clarifications.push(...first.clarifications);
  if (first.issues?.length) qualityIssues.push(...first.issues);
  const isolatedFrIds = [];
  const covered = coveredFrIds(tasks);
  const missing = frUnits.filter((unit) => unit?.id && !covered.has(unit.id));
  if (missing.length) {
    const one = await runSlice(missing, `${idPrefix}f`);
    if (one.ok) tasks.push(...one.tasks);
    else if (one.tasks?.length) tasks.push(...one.tasks);
    if (one.clarifications?.length) clarifications.push(...one.clarifications);
    if (one.issues?.length) qualityIssues.push(...one.issues);
    const now = coveredFrIds(tasks);
    for (const unit of missing) {
      if (now.has(unit.id)) continue;
      isolatedFrIds.push(unit.id);
    }
  }

  const needsReview =
    Boolean(first.needsReview) ||
    clarifications.length > 0 ||
    qualityIssues.length > 0 ||
    isolatedFrIds.length > 0;

  return {
    ok: !needsReview || tasks.length > 0,
    needsReview,
    tasks,
    isolatedFrIds,
    clarifications,
    qualityIssues,
    llmCalls,
    promptChars,
    model,
    repairAttempts,
    inputSnapshotId: input.inputSnapshotId || null,
  };
}

module.exports = { executeWbsChunk };
