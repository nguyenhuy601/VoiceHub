/**
 * Dependency synthesizer — LLM promotes tool candidates into schema 2.0 proposals.
 * Never invents pairs outside candidate list; may return empty deps + unresolvedQuestions.
 */

const { isHowSemanticSectionLlmOn } = require('../config/howSemanticLlmFlags');
const { invokeHowSemanticLlm, clip } = require('./howSemanticLlm');
const {
  normalizeDependencyAnalysisV2,
  pairKey,
} = require('./dependencySchemaV2');

const SYSTEM_PROMPT = [
  'You are a PM tech lead synthesizing task dependencies.',
  'Return JSON only with schema:',
  '{"analysisStatus":"COMPLETED|PARTIAL","dependencies":[{',
  '"predecessorTaskId","successorTaskId","relationship":"FS",',
  '"dependencyKind":"TECHNICAL|BUSINESS|DATA|RESOURCE",',
  '"blockingScope":"FULL|INTEGRATION_ONLY|TEST_ONLY|NONE",',
  '"title","reason","canWorkInParallel","parallelCondition",',
  '"requiredInput":{"name","condition","providedByTaskId"},',
  '"impactIfUnmet":{"affectedActivity","impact","severity"},',
  '"evidenceRefs":["TASK-ID:field"],"confidence":0.0',
  '}],"unresolvedQuestions":[{"taskId","question","whyItMatters"}]}',
  'RULES:',
  '1. You may ONLY promote pairs present in tool.candidates — never invent new task id pairs.',
  '2. Do NOT default UI→API as FULL blocking Finish-to-Start. If API contract exists or can be mocked, use blockingScope INTEGRATION_ONLY and canWorkInParallel true.',
  '3. If technical context lacks API contract / producer output clarity, prefer unresolvedQuestions or empty dependencies over hard FS.',
  '4. Weak rules SAME_AREA_ORDER / SRS_* should usually be omitted or INTEGRATION_ONLY — never FULL unless strong evidence.',
  '5. Empty dependencies array is valid. status is always implied PROPOSED.',
  '6. Every dependency must have a meaningful reason (why this blocking scope).',
].join(' ');

/**
 * @param {{
 *   candidateToolResult: object,
 *   contextPack: object,
 *   knownTaskIds: Set,
 *   pack?: object,
 *   container?: object,
 *   env?: object,
 *   generateJsonFn?: Function|null,
 * }} args
 */
async function synthesizeDependencyWithLlm({
  candidateToolResult,
  contextPack,
  knownTaskIds,
  env = process.env,
  generateJsonFn = null,
} = {}) {
  if (!isHowSemanticSectionLlmOn('dependency', env)) {
    return { ok: false, analysis: null, meta: { fallbackReason: 'llm_flag_off' } };
  }

  const candidates = candidateToolResult?.data?.candidates || [];
  const candidateKeys = new Set(
    candidates.map((c) => pairKey(c.predecessorTaskId, c.successorTaskId))
  );

  // Prefer strong + consume/explicit for prompt size; include weak sample
  const strong = candidates.filter(
    (c) =>
      c.strength === 'strong' ||
      c.candidateRule === 'EXPLICIT_DEPENDS_ON' ||
      c.candidateRule === 'CONSUMES_PRODUCER_OUTPUT'
  );
  const weak = candidates.filter((c) => !strong.includes(c)).slice(0, 20);
  const promptCandidates = [...strong, ...weak].slice(0, 48);

  const llm = await invokeHowSemanticLlm({
    env,
    generateJsonFn,
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      tool: {
        name: 'dependency_candidate',
        status: candidateToolResult?.status || 'success',
        data: {
          candidates: promptCandidates,
          unresolvedTaskIds: candidateToolResult?.data?.unresolvedTaskIds || [],
        },
      },
      context: {
        task: contextPack?.task || [],
        requirement: contextPack?.requirement || { frs: [], ucs: [] },
        technical: contextPack?.technical || {},
      },
      instruction:
        'Synthesize meaningful PROPOSED dependencies from tool candidates + context. Prefer parallel when contract/mock allows.',
    }),
    numCtx: 8192,
  });

  if (!llm.ok) {
    return {
      ok: false,
      analysis: null,
      meta: {
        fallbackReason: llm.meta?.fallbackReason || 'llm_failed',
        model: llm.meta?.model || null,
        llmCalls: llm.meta?.llmCalls || 0,
      },
    };
  }

  const analysis = normalizeDependencyAnalysisV2(llm.data || {}, {
    knownTaskIds,
    candidateKeys,
  });

  return {
    ok: true,
    analysis,
    meta: {
      model: llm.meta?.model || null,
      llmCalls: llm.meta?.llmCalls || 1,
      llmDepsProposed: analysis.dependencies.length,
      candidateKeysCount: candidateKeys.size,
    },
  };
}

/** @deprecated — kept for tests that import normalizeLlmEdges */
function normalizeLlmEdges(rawEdges, knownIds) {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds || []);
  const analysis = normalizeDependencyAnalysisV2(
    {
      dependencies: (rawEdges || []).map((row) => ({
        predecessorTaskId: row.to || row.predecessorTaskId,
        successorTaskId: row.from || row.successorTaskId,
        reason: row.evidence || row.reason,
        blockingScope: row.blocking === false ? 'INTEGRATION_ONLY' : 'FULL',
        canWorkInParallel: row.blocking === false,
        status: 'PROPOSED',
        source: 'llm',
        _ungated: true,
      })),
    },
    { knownTaskIds: known, allowUngated: true }
  );
  return analysis.edges.map((e) => ({
    ...e,
    evidence: clip(e.evidence, 120),
  }));
}

/** @deprecated name — use synthesizeDependencyWithLlm */
async function enrichDependencyWithLlm(heuristicResult, opts = {}) {
  // Legacy shim: if caller passes old shape, return heuristic unchanged when no candidates
  void heuristicResult;
  void opts;
  return heuristicResult;
}

module.exports = {
  synthesizeDependencyWithLlm,
  enrichDependencyWithLlm,
  normalizeLlmEdges,
  SYSTEM_PROMPT,
};
