/**
 * Deploy sec — env/CI from SNAP only; LLM may refine checklist wording (no invent env).
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { isLlmEnabled } = require('../../runtime/ollamaGenerate');
const { invokeHowSemanticLlm } = require('../../engines/howSemanticLlm');
const {
  runDeployPlanEngine,
  applyDeployPlanToContainer,
  isDeployPlanStructurallyOk,
} = require('../../engines/deployPlan');

function field() {
  return Annotation();
}
function clip(s, max = 160) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** Schema default plus kinds already stored on the checklist. */
function checklistKindAllow(items = []) {
  const kinds = new Set(['checklist']);
  for (const item of items) {
    const kind = String(item?.kind || '').trim();
    if (kind) kinds.add(kind);
  }
  return [...kinds];
}

function buildDeploySemantic({ pack = {}, container = {}, toolData = {}, env = process.env } = {}) {
  const { normalizeDeriveLocale } = require('../../semantic/buildSemanticDeriveContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE
  );
  const technical = toolData.technical || pack.technical || {};
  const environments = Array.isArray(technical.environments)
    ? technical.environments
        .map((e) => (typeof e === 'string' ? e : e?.name || e?.key))
        .filter(Boolean)
    : [];
  const missingSlots = [];
  if (!locale) missingSlots.push('business.locale');

  const openQuestions = [];
  if (!environments.length) {
    openQuestions.push({
      code: 'DEPLOY_NO_ENV',
      message: 'Thiếu technical.environments trên SNAP — không bịa env.',
    });
  }

  return {
    ok: missingSlots.length === 0,
    missingSlots,
    openQuestions,
    allowLists: { environments },
    semantic: {
      business: { locale, projectName: clip(pack.overview?.name || pack.name, 80) },
      system: {
        environments,
        ciProvider: technical.ciProvider || technical.ci?.provider || null,
        releaseMode: technical.releaseMode || null,
      },
      upstream: {
        hasScheduleReleases: Boolean(container?.planning?.schedulePlan?.releases?.length),
      },
    },
  };
}

async function proposeDeploy({ semantic, basePlan, env, generateJsonFn }) {
  if (!semantic) return { ok: false, skipped: true, meta: { fallbackReason: 'missing_SEMANTIC' } };
  if (!isLlmEnabled(env)) return { ok: false, skipped: true, meta: { fallbackReason: 'LLM_off' } };
  const { languageInstruction } = require('../../semantic/buildSemanticDeriveContext');
  const checklistKinds = checklistKindAllow(basePlan?.phase4Checklist || []);
  const system = [
    'You are a deployment planning specialist. Return JSON only.',
    'Improve the wording of the provided deployment checklist. Each item must describe a clear, actionable deployment or verification activity while preserving its original intent and kind.',
    'Use only environments in ALLOW.environments. Do not invent environments, CI/CD providers, tools, infrastructure, commands, credentials, or deployment steps unsupported by the input. Do not expand the deployment scope.',
    'kind must be copied from the matching input item. If that item has no kind, use "checklist". kind must be one of ALLOW.kinds. Do not invent a new kind.',
    'Output: {"checklist":[{"title":"...","summary":"...","kind":"..."}],"openQuestions":[]}.',
    languageInstruction(semantic.business?.locale || 'vi'),
  ].join(' ');
  const user = [
    `SEMANTIC=${JSON.stringify(semantic)}`,
    `FACTS=${JSON.stringify({
      envMatrix: basePlan?.envMatrix || [],
      phase4Checklist: basePlan?.phase4Checklist || [],
    })}`,
    `ALLOW=${JSON.stringify({
      environments: semantic.system?.environments || [],
      kinds: checklistKinds,
    })}`,
    `SHAPE={"checklist":[{"title":"","summary":"","kind":"checklist"}],"openQuestions":[]}`,
  ].join('\n');
  const llm = await invokeHowSemanticLlm({ system, user, env, generateJsonFn });
  return llm.ok
    ? { ok: true, data: llm.data, meta: { llmCalls: 1, model: llm.meta?.model } }
    : { ok: false, data: null, meta: { ...llm.meta, llmCalls: 1 } };
}

function acceptDeploy({ raw, baseResult, openQuestionsIn = [] }) {
  const plan = { ...(baseResult?.deployPlan || {}) };
  const openQuestions = [...(plan.openQuestions || []), ...openQuestionsIn];
  for (const q of raw?.openQuestions || []) {
    if (q?.message) openQuestions.push({ code: q.code || 'DEPLOY_OQ', message: clip(q.message) });
  }
  if (Array.isArray(raw?.checklist) && raw.checklist.length) {
    const allowedKinds = new Set(checklistKindAllow(plan.phase4Checklist || []));
    plan.phase4Checklist = raw.checklist.slice(0, 40).map((c, i) => {
      const kind = String(c.kind || '').trim();
      return {
        id: `CHK-${i + 1}`,
        title: clip(c.title, 120),
        summary: clip(c.summary, 200),
        kind: allowedKinds.has(kind) ? kind : 'checklist',
        provenance: { type: 'AI', source: 'deploy_sec_tool_llm' },
      };
    });
  }
  plan.openQuestions = openQuestions;
  plan.meta = {
    ...(plan.meta || {}),
    source: raw?.checklist?.length ? 'fact_llm' : plan.meta?.source || 'snap_fact',
    inventEnvForbidden: true,
  };
  return {
    status: baseResult?.status || 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    deployPlan: plan,
    meta: plan.meta,
  };
}

const DeployState = Annotation.Root({
  pack: field(),
  container: field(),
  toolData: field(),
  env: field(),
  generateJsonFn: field(),
  semanticOut: field(),
  baseResult: field(),
  proposed: field(),
  result: field(),
  containerPatch: field(),
});

function buildDeploySecGraph() {
  const graph = new StateGraph(DeployState);
  graph.addNode('semantic', async (s) => ({
    semanticOut: buildDeploySemantic({
      pack: s.pack,
      container: s.container,
      toolData: s.toolData,
      env: s.env,
    }),
  }));
  graph.addNode('fact', async (s) => ({
    baseResult: runDeployPlanEngine(s.container || {}, s.toolData || {}),
  }));
  graph.addNode('propose', async (s) => {
    if (!s.semanticOut?.ok) {
      return { proposed: { ok: false, skipped: true, meta: { fallbackReason: 'semantic_incomplete' } } };
    }
    return {
      proposed: await proposeDeploy({
        semantic: s.semanticOut.semantic,
        basePlan: s.baseResult?.deployPlan,
        env: s.env,
        generateJsonFn: s.generateJsonFn,
      }),
    };
  });
  graph.addNode('accept', async (s) => {
    const sem = s.semanticOut || {};
    const proposed = s.proposed || {};
    const result = acceptDeploy({
      raw: proposed.ok ? proposed.data : {},
      baseResult: s.baseResult,
      openQuestionsIn: [
        ...(sem.openQuestions || []),
        ...(sem.ok ? [] : [{ code: 'DEPLOY_SEMANTIC_INCOMPLETE', message: (sem.missingSlots || []).join(',') }]),
      ],
    });
    result.model = proposed.meta?.model || null;
    result.meta.llmCalls = proposed.meta?.llmCalls || 0;
    return {
      result,
      containerPatch: applyDeployPlanToContainer(s.container || {}, result),
    };
  });
  graph.addEdge(START, 'semantic');
  graph.addEdge('semantic', 'fact');
  graph.addEdge('fact', 'propose');
  graph.addEdge('propose', 'accept');
  graph.addEdge('accept', END);
  return graph.compile();
}

let _c = null;
async function runDeploySecGraph(input = {}) {
  if (!_c) _c = buildDeploySecGraph();
  const out = await _c.invoke({
    pack: input.pack || {},
    container: input.container || {},
    toolData: input.toolData || {},
    env: input.env || process.env,
    generateJsonFn: input.generateJsonFn || null,
  });
  return { result: out.result, containerPatch: out.containerPatch };
}

module.exports = {
  buildDeploySecGraph,
  runDeploySecGraph,
  buildDeploySemantic,
  isDeployPlanStructurallyOk,
  acceptDeploy,
};
