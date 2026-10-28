/**
 * Releases sec — rename real sprint/release windows only (no invent dates/Sprint N outside bounds).
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { isLlmEnabled } = require('../../runtime/ollamaGenerate');
const { invokeHowSemanticLlm } = require('../../engines/howSemanticLlm');

function field() {
  return Annotation();
}
function clip(s, max = 120) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

async function buildReleasesSemantic({ pack = {}, container = {}, env = process.env, contextPackage = null, snapshot = null, snapshotId = null } = {}) {
  const { normalizeDeriveLocale } = require('../../semantic/buildSemanticDeriveContext');
  const {
    assembleHowToolContext,
    slimLayer,
    contextAllowsWork,
    missingSlotsFor,
  } = require('../../semanticLayer/howToolContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE
  );
  const layer = await assembleHowToolContext({
    purpose: 'RELEASES',
    pack,
    container,
    env,
    contextPackage,
    snapshot,
    snapshotId,
  });
  const sprints = layer.requiredData?.sprints || [];
  const releases = layer.requiredData?.releases || [];
  const missingSlots = missingSlotsFor('RELEASES', layer);
  if (!locale) missingSlots.push('business.locale');
  return {
    ok: contextAllowsWork(layer) && Boolean(locale) && (sprints.length > 0 || releases.length > 0),
    missingSlots,
    openQuestions:
      sprints.length || releases.length
        ? []
        : [{ code: 'REL_NO_WINDOWS', message: 'Chưa có sprint/release window từ schedule thật.' }],
    allowLists: {
      sprintIds: sprints.map((row) => row.id),
      releaseIds: releases.map((row) => row.id),
    },
    semantic: {
      business: {
        locale,
        projectName: clip(pack.overview?.name || pack.name, 80),
        goals: (pack.businessGoals || []).map((goal) => clip(goal.name || goal.title || goal, 80)),
      },
      system: {},
      upstream: { sprints, releases },
      layer: slimLayer(layer),
    },
  };
}

async function proposeReleases({ semantic, facts, env, generateJsonFn }) {
  if (!semantic) return { ok: false, skipped: true, meta: { fallbackReason: 'missing_SEMANTIC' } };
  if (!isLlmEnabled(env)) return { ok: false, skipped: true, meta: { fallbackReason: 'LLM_off' } };
  const { languageInstruction } = require('../../semantic/buildSemanticDeriveContext');
  const system = [
    'You are a project release planner. Return JSON only.',
    'Improve the names and summaries of existing sprints and releases using the provided project context and FACTS. This step only names and phrases; it does not plan sprints or releases.',
    'Preserve each id exactly as listed in ALLOW. Names must state the delivery objective. Summaries must describe only scope supported by the input.',
    'Do not create, remove, reorder, or renumber sprints or releases. Do not change dates, duration, task assignments, or delivery scope. Do not invent milestones or features.',
    'Output: {"sprints":[{"id":"...","name":"...","summary":"..."}],"releases":[{"id":"...","name":"...","summary":"..."}],"openQuestions":[]}.',
    languageInstruction(semantic.business?.locale || 'vi'),
  ].join(' ');
  const { layer: _omitLayer, ...semanticForPrompt } = semantic || {};
  void _omitLayer;
  const user = [
    `SEMANTIC=${JSON.stringify(semanticForPrompt)}`,
    `FACTS=${JSON.stringify(semantic.upstream)}`,
    `ALLOW=${JSON.stringify(facts.allowLists)}`,
    `SHAPE={"sprints":[{"id":"","name":"","summary":""}],"releases":[{"id":"","name":"","summary":""}],"openQuestions":[]}`,
  ].join('\n');
  const llm = await invokeHowSemanticLlm({ system, user, env, generateJsonFn });
  return llm.ok
    ? { ok: true, data: llm.data, meta: { llmCalls: 1, model: llm.meta?.model } }
    : { ok: false, data: null, meta: { ...llm.meta, llmCalls: 1 } };
}

function acceptReleases({ raw, container, allowLists, openQuestionsIn = [] }) {
  const sprintIds = new Set(allowLists?.sprintIds || []);
  const releaseIds = new Set(allowLists?.releaseIds || []);
  const rejectedInvent = [];
  const nameBySprint = new Map();
  const nameByRelease = new Map();
  for (const s of raw?.sprints || []) {
    const id = String(s.id || '').trim();
    if (!sprintIds.has(id)) {
      rejectedInvent.push({ reason: 'sprint_id_not_in_allow', id });
      continue;
    }
    nameBySprint.set(id, { name: clip(s.name, 80), summary: clip(s.summary, 200) });
  }
  for (const r of raw?.releases || []) {
    const id = String(r.id || '').trim();
    if (!releaseIds.has(id)) {
      rejectedInvent.push({ reason: 'release_id_not_in_allow', id });
      continue;
    }
    nameByRelease.set(id, { name: clip(r.name, 80), summary: clip(r.summary, 200) });
  }

  const schedulePlan = {
    ...(container?.planning?.schedulePlan || {}),
  };
  schedulePlan.sprints = (schedulePlan.sprints || []).map((s) => {
    const n = nameBySprint.get(String(s.id));
    return n ? { ...s, name: n.name || s.name, summary: n.summary } : s;
  });
  schedulePlan.releases = (schedulePlan.releases || []).map((r) => {
    const n = nameByRelease.get(String(r.id));
    return n ? { ...r, name: n.name || r.name, summary: n.summary } : r;
  });
  schedulePlan.openQuestions = [
    ...(schedulePlan.openQuestions || []),
    ...openQuestionsIn,
    ...(raw?.openQuestions || []),
  ];
  schedulePlan.meta = {
    ...(schedulePlan.meta || {}),
    releaseNamingSource: nameBySprint.size || nameByRelease.size ? 'fact_llm' : 'schedule_windows',
    rejectedInvent,
  };

  return {
    container: {
      ...container,
      planning: { ...(container?.planning || {}), schedulePlan },
    },
    meta: schedulePlan.meta,
  };
}

const RelState = Annotation.Root({
  pack: field(),
  container: field(),
  env: field(),
  generateJsonFn: field(),
  contextPackage: field(),
  snapshot: field(),
  snapshotId: field(),
  semanticOut: field(),
  proposed: field(),
  result: field(),
  containerPatch: field(),
});

function buildReleasesSecGraph() {
  const graph = new StateGraph(RelState);
  graph.addNode('semantic', async (s) => ({
    semanticOut: await buildReleasesSemantic({
      pack: s.pack,
      container: s.container,
      env: s.env,
      contextPackage: s.contextPackage,
      snapshot: s.snapshot,
      snapshotId: s.snapshotId,
    }),
  }));
  graph.addNode('fact', async () => ({}));
  graph.addNode('propose', async (s) => {
    if (!s.semanticOut?.ok) {
      return { proposed: { ok: false, skipped: true, meta: { fallbackReason: 'semantic_incomplete' } } };
    }
    return {
      proposed: await proposeReleases({
        semantic: s.semanticOut.semantic,
        facts: { allowLists: s.semanticOut.allowLists },
        env: s.env,
        generateJsonFn: s.generateJsonFn,
      }),
    };
  });
  graph.addNode('accept', async (s) => {
    const sem = s.semanticOut || {};
    const proposed = s.proposed || {};
    const accepted = acceptReleases({
      raw: proposed.ok ? proposed.data : {},
      container: s.container || {},
      allowLists: sem.allowLists,
      openQuestionsIn: [
        ...(sem.openQuestions || []),
        ...(sem.ok ? [] : [{ code: 'REL_SEMANTIC_INCOMPLETE', message: (sem.missingSlots || []).join(',') }]),
      ],
    });
    return {
      result: { schedulePlan: accepted.container?.planning?.schedulePlan, meta: accepted.meta },
      containerPatch: accepted.container,
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
async function runReleasesSecGraph(input = {}) {
  if (!_c) _c = buildReleasesSecGraph();
  const out = await _c.invoke({
    pack: input.pack || {},
    container: input.container || {},
    env: input.env || process.env,
    generateJsonFn: input.generateJsonFn || null,
    contextPackage: input.contextPackage || null,
    snapshot: input.snapshot || null,
    snapshotId: input.snapshotId || null,
  });
  return { result: out.result, containerPatch: out.containerPatch };
}

module.exports = { runReleasesSecGraph, buildReleasesSemantic, acceptReleases };
