/**
 * Effort & Roles — Semantic→Fact→Propose→Accept.
 * Hours from real WBS leaves + history/config; roles ∈ enabledProjectRoleKeys only.
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { isLlmEnabled } = require('../../runtime/ollamaGenerate');
const { invokeHowSemanticLlm } = require('../../engines/howSemanticLlm');
const {
  runRoleSkillPlanning,
  applyRoleSkillToContainer,
} = require('../../engines/roleSkill');
const { runEffortEngine, applyEffortToContainer } = require('../../engines/effort');
const { resolveAllowedProjectRoleKey } = require('../../engines/roleKey');

function field() {
  return Annotation();
}
function clip(s, max = 160) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function buildEffortRolesSemantic({ pack = {}, container = {}, toolData = {}, env = process.env } = {}) {
  const { normalizeDeriveLocale } = require('../../semantic/buildSemanticDeriveContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE
  );
  const allowList = Array.isArray(toolData.enabledProjectRoleKeys)
    ? toolData.enabledProjectRoleKeys.map(String).filter(Boolean)
    : undefined;
  const leaves = (container?.planning?.tasks || []).filter((t) => {
    if (t?.duplicateOf) return false;
    const level = String(t?.level || 'task').toLowerCase();
    return level === 'task' || level === 'subtask';
  });
  const roleHoursFromWbs = {};
  for (const t of leaves) {
    const key = String(t.suggestedRoleKey || '').trim();
    if (!key) continue;
    const h = Number(t.effortHours);
    roleHoursFromWbs[key] = (roleHoursFromWbs[key] || 0) + (Number.isFinite(h) ? h : 0);
  }
  const missingSlots = [];
  if (!locale) missingSlots.push('business.locale');
  if (!leaves.length) missingSlots.push('upstream.wbsLeaves');

  const openQuestions = [];
  if (!leaves.length) {
    openQuestions.push({
      code: 'EFFORT_NO_LEAVES',
      message: 'Chưa có WBS leaf thật — không ước lượng ảo.',
    });
  }
  if (!allowList?.length) {
    openQuestions.push({
      code: 'EFFORT_NO_ROLE_CATALOG',
      message: 'Thiếu enabledProjectRoleKeys trên SNAP/toolData — role WBS không khóa catalog org.',
    });
  }

  return {
    ok: missingSlots.length === 0,
    missingSlots,
    openQuestions,
    allowLists: { roleKeys: allowList || [] },
    semantic: {
      business: { locale, projectName: clip(pack.overview?.name || pack.name, 80) },
      system: {
        enabledProjectRoleKeys: allowList || [],
        historyMetrics: toolData.historyMetrics || null,
        maxEffortHours: toolData.maxEffortHours ?? null,
      },
      upstream: {
        leafCount: leaves.length,
        roleHoursFromWbs,
        leafBrief: leaves.map((t) => ({
          id: String(t.id || ''),
          title: clip(t.name || t.title, 60),
          area: t.area || null,
          suggestedRoleKey: t.suggestedRoleKey || null,
          effortHours: t.effortHours != null ? Number(t.effortHours) : null,
        })),
      },
    },
  };
}

async function proposeEffortRoles({ semantic, facts, env, generateJsonFn }) {
  if (!semantic) return { ok: false, skipped: true, meta: { fallbackReason: 'missing_SEMANTIC' } };
  if (!isLlmEnabled(env)) return { ok: false, skipped: true, meta: { fallbackReason: 'LLM_off' } };
  const { languageInstruction } = require('../../semantic/buildSemanticDeriveContext');
  const system = [
    'You are a delivery estimator. JSON only. Read SEMANTIC then FACTS.',
    'roleKey must be in ALLOW.roleKeys when ALLOW is non-empty. Never invent roles outside catalog.',
    'Return {"roleSummaries":[{"roleKey","title","summary"}],"openQuestions":[]}.',
    'title/summary: business-readable rationale for hours already allocated on WBS leaves (SEMANTIC.upstream.roleHoursFromWbs / FACTS.byRole).',
    'Do not invent hour totals or roles absent from WBS leaf suggestedRoleKey / ALLOW.',
    languageInstruction(semantic.business?.locale || 'vi'),
  ].join(' ');
  const user = [
    `SEMANTIC=${JSON.stringify(semantic)}`,
    `FACTS=${JSON.stringify({
      byRole: facts.byRole,
      roles: facts.roles,
      wbsRoleHours: semantic.upstream?.roleHoursFromWbs || {},
    })}`,
    `ALLOW=${JSON.stringify({ roleKeys: facts.allowLists?.roleKeys || [] })}`,
    `SHAPE={"roleSummaries":[{"roleKey":"","title":"","summary":""}],"openQuestions":[]}`,
  ].join('\n');
  const llm = await invokeHowSemanticLlm({ system, user, env, generateJsonFn });
  return llm.ok
    ? { ok: true, data: llm.data, meta: { llmCalls: 1, model: llm.meta?.model } }
    : { ok: false, data: null, meta: { ...llm.meta, llmCalls: 1 } };
}

function acceptEffortRoles({ raw, facts, containerAfterEffort, openQuestionsIn = [] }) {
  const roleSet = new Set((facts.allowLists?.roleKeys || []).map(String));
  const rejectedInvent = [];
  const summaries = {};
  for (const row of raw?.roleSummaries || []) {
    let key = resolveAllowedProjectRoleKey(row.roleKey, {
      allowList: facts.allowLists?.roleKeys,
      fallback: row.roleKey,
    });
    if (roleSet.size && !roleSet.has(key)) {
      rejectedInvent.push({ reason: 'role_not_in_allow', roleKey: row.roleKey });
      continue;
    }
    summaries[key] = {
      title: clip(row.title || key, 120),
      summary: clip(row.summary, 240),
    };
  }
  const planning = containerAfterEffort?.planning || {};
  const roles = (planning.roles || []).map((r) => {
    const key = r.roleKey;
    const s = summaries[key];
    return s ? { ...r, title: s.title, summary: s.summary } : r;
  });
  return {
    container: {
      ...containerAfterEffort,
      planning: {
        ...planning,
        roles,
        effort: planning.effort,
        openQuestions: [
          ...(planning.openQuestions || []),
          ...openQuestionsIn,
          ...(raw?.openQuestions || []),
        ],
      },
    },
    meta: {
      source: Object.keys(summaries).length ? 'fact_llm' : 'effort_engine',
      rejectedInvent,
      llmCalls: 0,
    },
  };
}

const EffortSecState = Annotation.Root({
  pack: field(),
  container: field(),
  toolData: field(),
  env: field(),
  generateJsonFn: field(),
  semanticOut: field(),
  facts: field(),
  afterEffort: field(),
  proposed: field(),
  result: field(),
  containerPatch: field(),
});

function buildEffortRolesSecGraph() {
  const graph = new StateGraph(EffortSecState);
  graph.addNode('semantic', async (s) => ({
    semanticOut: buildEffortRolesSemantic({
      pack: s.pack,
      container: s.container,
      toolData: s.toolData,
      env: s.env,
    }),
  }));
  graph.addNode('fact', async (s) => {
    const sem = s.semanticOut || {};
    const allowList = sem.allowLists?.roleKeys?.length ? sem.allowLists.roleKeys : undefined;
    let container = s.container || {};
    const roleSkill = runRoleSkillPlanning(s.pack || {}, container, { allowList });
    container = applyRoleSkillToContainer(container, roleSkill);
    const engineResult = runEffortEngine(container, {
      historyMetrics: s.toolData?.historyMetrics || null,
      maxEffortHours: s.toolData?.maxEffortHours,
      allowList,
    });
    const afterEffort = applyEffortToContainer(container, engineResult);
    const byRole = engineResult.effort?.byRole || {};
    return {
      facts: {
        byRole,
        wbsRoleHours: { ...byRole },
        roles: afterEffort.planning?.roles || [],
        allowLists: sem.allowLists || {},
        engineResult,
        roleSkill,
      },
      afterEffort,
    };
  });
  graph.addNode('propose', async (s) => {
    if (!s.semanticOut?.ok) {
      return { proposed: { ok: false, skipped: true, meta: { fallbackReason: 'semantic_incomplete' } } };
    }
    const semantic = {
      ...(s.semanticOut.semantic || {}),
      upstream: {
        ...(s.semanticOut.semantic?.upstream || {}),
        roleHoursFromWbs: s.facts?.wbsRoleHours || s.semanticOut.semantic?.upstream?.roleHoursFromWbs || {},
      },
    };
    return {
      proposed: await proposeEffortRoles({
        semantic,
        facts: s.facts,
        env: s.env,
        generateJsonFn: s.generateJsonFn,
      }),
    };
  });
  graph.addNode('accept', async (s) => {
    const sem = s.semanticOut || {};
    const proposed = s.proposed || {};
    const accepted = acceptEffortRoles({
      raw: proposed.ok ? proposed.data : {},
      facts: s.facts,
      containerAfterEffort: s.afterEffort,
      openQuestionsIn: [
        ...(sem.openQuestions || []),
        ...(sem.ok ? [] : [{ code: 'EFFORT_SEMANTIC_INCOMPLETE', message: (sem.missingSlots || []).join(',') }]),
      ],
    });
    return {
      result: {
        engineResult: s.facts?.engineResult,
        roleSkill: s.facts?.roleSkill,
        container: accepted.container,
        meta: { ...accepted.meta, llmCalls: proposed.meta?.llmCalls || 0 },
      },
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
async function runEffortRolesSecGraph(input = {}) {
  if (!_c) _c = buildEffortRolesSecGraph();
  const out = await _c.invoke({
    pack: input.pack || {},
    container: input.container || {},
    toolData: input.toolData || {},
    env: input.env || process.env,
    generateJsonFn: input.generateJsonFn || null,
  });
  return { result: out.result, containerPatch: out.containerPatch };
}

module.exports = { runEffortRolesSecGraph, buildEffortRolesSemantic };
