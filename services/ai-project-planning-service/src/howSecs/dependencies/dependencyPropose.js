/**
 * Dependency LLM Propose — one DashScope call for the full candidate set.
 * Chat Completions ignores Ollama num_ctx, so slicing pairs does not shrink the request.
 */

const { isLlmEnabled } = require('../../runtime/ollamaGenerate');
const { invokeHowSemanticLlm } = require('../../engines/howSemanticLlm');
const { buildDependencyEvidenceCatalog } = require('./dependencyFacts');
const { acceptLlmEdge } = require('./dependencyAccept');

/** One call must return before the 120s DependencyTool wrapper. */
const CALL_TIMEOUT_MS = 90_000;
/** Title + summary per edge. Cap stays far under the 32k qwen-plus default. */
const NUM_PREDICT_CAP = 8192;
const FAST_FAIL_RETRY_MS = 12_000;

function outputTokenBudget(candidateCount) {
  const count = Math.max(0, Number(candidateCount) || 0);
  return Math.min(NUM_PREDICT_CAP, Math.max(1024, 256 + count * 160));
}

async function proposeDependencyWithLlm({
  semantic = null,
  facts = null,
  env = process.env,
  generateJsonFn = null,
} = {}) {
  if (!semantic) {
    return { ok: false, skipped: true, data: null, meta: { fallbackReason: 'missing_SEMANTIC' } };
  }
  if (!isLlmEnabled(env)) {
    return { ok: false, skipped: true, data: null, meta: { fallbackReason: 'LLM_off' } };
  }

  let languageInstruction = '';
  try {
    const { languageInstruction: langFn } = require('../../semantic/buildSemanticDeriveContext');
    languageInstruction = langFn(semantic.business?.locale || 'vi');
  } catch {
    /* ignore */
  }

  const system = [
    'You are a project delivery planner. Return JSON only.',
    'Read SEMANTIC before FACTS. Propose an edge only when a FACTS.candidates or FACTS.srsEdges row supports it. Never infer an edge from similarity or assumed workflow alone.',
    'Copy from and to from that evidence row. from is the successor task id and to is the predecessor task id — do not swap them. depType is FS, SS, FF, or SF.',
    'reason states why that evidence requires the dependency. evidenceRefs must list only ids from those FACTS rows.',
    'Put unresolved decisions in openQuestions with question, relatedTaskIds, and reason. relatedTaskIds must be task ids in ALLOW.',
    'If no evidence row supports a dependency, return edges: [].',
    'Output: {"edges":[{"from":"...","to":"...","depType":"FS|SS|FF|SF","reason":"...","evidenceRefs":["DEP-CAND-01"]}],"openQuestions":[{"question":"...","relatedTaskIds":[],"reason":"..."}]}.',
    languageInstruction,
  ]
    .filter(Boolean)
    .join(' ');

  const allow = new Set((facts.allowLists?.taskIds || []).map((id) => String(id)));
  const catalog = buildDependencyEvidenceCatalog(facts);
  const candidates = catalog.candidates.filter((row) => allow.has(row.from) && allow.has(row.to));
  const srsEdges = catalog.srsEdges.filter((edge) => allow.has(edge.from) && allow.has(edge.to));

  const ids = new Set();
  for (const row of [...candidates, ...srsEdges]) {
    if (row.from) ids.add(row.from);
    if (row.to) ids.add(row.to);
  }

  function keepContractEdges(data) {
    const known = new Set([...ids].filter((id) => allow.has(id)));
    const byId = new Map(
      [...candidates, ...srsEdges].map((row) => [row.id, row])
    );
    const kept = [];
    for (const edge of data?.edges || []) {
      const accepted = acceptLlmEdge(edge, known, byId);
      if (accepted.ok) kept.push(accepted.edge);
    }
    return kept;
  }

  const taskBrief = (semantic.upstream?.taskBrief || []).filter((row) => ids.has(String(row.id)));
  const citedFr = new Set(taskBrief.flatMap((row) => row.sourceFrIds || []).map(String));
  const frBrief = (semantic.business?.frBrief || []).filter((row) => citedFr.has(String(row.id)));
  const user = [
    `SEMANTIC=${JSON.stringify({
      business: {
        locale: semantic.business?.locale,
        projectName: semantic.business?.projectName,
        frBrief,
      },
      upstream: { taskBrief },
    })}`,
    `FACTS=${JSON.stringify({
      candidates: candidates.map((row) => ({
        id: row.id,
        from: row.from,
        to: row.to,
        candidateRule: row.candidateRule,
        strength: row.strength,
      })),
      srsEdges: srsEdges.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        depType: edge.depType,
      })),
    })}`,
    `ALLOW=${JSON.stringify({ taskIds: [...ids].filter((id) => allow.has(id)) })}`,
    semantic?.layer ? `CONTEXT=${JSON.stringify(semantic.layer)}` : '',
    `SHAPE=${JSON.stringify({
      edges: [{ from: 'successorTaskId', to: 'predecessorTaskId', depType: 'FS|SS|FF|SF', reason: 'string', evidenceRefs: ['DEP-CAND-01'] }],
      openQuestions: [{ question: 'string', relatedTaskIds: ['taskId'], reason: 'string' }],
    })}`,
  ].join('\n');

  const numPredict = outputTokenBudget(candidates.length);
  let llmCalls = 0;
  let model = null;

  async function callOnce() {
    const started = Date.now();
    const llm = await invokeHowSemanticLlm({
      system,
      user,
      env,
      generateJsonFn,
      timeoutMs: CALL_TIMEOUT_MS,
      numPredict,
    });
    llmCalls += 1;
    model = llm.meta?.model || model;
    return { llm, elapsedMs: Date.now() - started };
  }

  let { llm, elapsedMs } = await callOnce();
  if (!llm.ok && elapsedMs < FAST_FAIL_RETRY_MS) {
    ({ llm } = await callOnce());
  }

  if (!llm.ok) {
    return {
      ok: false,
      data: null,
      meta: {
        llmCalls,
        model,
        fallbackReason: llm.meta?.fallbackReason || 'llm_failed',
      },
    };
  }

  return {
    ok: true,
    data: {
      edges: keepContractEdges(llm.data),
      openQuestions: Array.isArray(llm.data?.openQuestions) ? llm.data.openQuestions : [],
    },
    meta: { llmCalls, model },
  };
}

module.exports = {
  proposeDependencyWithLlm,
  CALL_TIMEOUT_MS,
  NUM_PREDICT_CAP,
  outputTokenBudget,
};
