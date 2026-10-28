/**
 * Dependency Accept — technical intake of LLM proposals (≠ PM CONFIRMED).
 * Separates proposalEdges vs schedulableEdges (FS lag 0, acyclic).
 */

const { applyDependencyToContainer } = require('../../engines/dependency');
const { buildDependencyEvidenceCatalog, depTypeOf } = require('./dependencyFacts');
const { ANALYSIS_STATUS } = require('./dependencyAnalysisStatus');
const {
  mapEventsToDepType,
  eventsFromDepType,
  normalizeDepEvent,
} = require('./dependencyTypeMap');

const BASIS = new Set(['EXPLICIT', 'INFERRED']);
const REQUIRED_AT = new Set(['FULL', 'INTEGRATION', 'TEST_ONLY', 'START']);

function buildOrderHint(tasks = [], edges = []) {
  const ids = tasks.map((t) => String(t.id || t.taskId || '').trim()).filter(Boolean);
  if (!edges.length) return ids;
  const indegree = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (!indegree.has(e.from) || !indegree.has(e.to)) continue;
    adj.get(e.to).push(e.from);
    indegree.set(e.from, (indegree.get(e.from) || 0) + 1);
  }
  const queue = ids.filter((id) => (indegree.get(id) || 0) === 0);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of adj.get(id) || []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  for (const id of ids) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

function clip(s, max = 160) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function normalizeOpenQuestion(q, known, rejectedInvent) {
  if (!q || typeof q !== 'object') return null;
  const question = clip(q.question || '', 200);
  const reason = clip(q.reason || '', 200);
  const legacy = clip(q.message || '', 200);
  if (!question && !reason && !legacy) return null;
  let relatedTaskIds = [];
  if (Array.isArray(q.relatedTaskIds)) {
    const rawIds = q.relatedTaskIds.map((id) => String(id || '').trim()).filter(Boolean);
    relatedTaskIds = rawIds.filter((id) => known.has(id));
    const unknown = rawIds.filter((id) => !known.has(id));
    if (unknown.length) {
      rejectedInvent.push({ reason: 'oq_task_not_in_allow', relatedTaskIds: unknown });
    }
    if (rawIds.length && !relatedTaskIds.length) return null;
  }
  const message = clip([question || legacy, reason].filter(Boolean).join(' — '), 240);
  return {
    code: String(q.code || 'DEP_OQ'),
    message,
    ...(question ? { question } : {}),
    ...(reason ? { reason } : {}),
    ...(relatedTaskIds.length ? { relatedTaskIds } : {}),
  };
}

function evidenceRefsOf(edge) {
  if (!Array.isArray(edge?.evidenceRefs)) return null;
  const refs = [];
  for (const ref of edge.evidenceRefs) {
    if (typeof ref !== 'string') return null;
    const id = ref.trim();
    if (!id || refs.includes(id)) continue;
    refs.push(id);
  }
  return refs;
}

function taskSourceFrSet(facts, taskId) {
  const brief = (facts?.taskBrief || []).find((t) => String(t.id) === String(taskId));
  return new Set((brief?.sourceFrIds || []).map(String));
}

function evidenceBelongsToEdge(cited, from, to, facts) {
  if (!cited) return false;
  if (cited.taskId) {
    return cited.taskId === from || cited.taskId === to;
  }
  if (cited.frId) {
    const fromFr = taskSourceFrSet(facts, from);
    const toFr = taskSourceFrSet(facts, to);
    return fromFr.has(cited.frId) || toFr.has(cited.frId);
  }
  return false;
}

function hasExplicitDependsOn(facts, from, to) {
  const succ = (facts?.taskBrief || []).find((t) => String(t.id) === String(from));
  if (!succ) return false;
  return (succ.dependsOn || []).map(String).includes(String(to));
}

/**
 * Tarjan-lite SCC on FS candidate edges. Returns Set of edge keys in non-trivial SCCs.
 */
function findCycleEdgeKeys(edges = []) {
  const nodes = new Set();
  for (const e of edges) {
    nodes.add(e.from);
    nodes.add(e.to);
  }
  const adj = new Map([...nodes].map((id) => [id, []]));
  for (const e of edges) {
    // from depends on to ⇒ edge to → from in precedence graph
    adj.get(e.to).push(e.from);
  }

  let index = 0;
  const indices = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];

  function strongconnect(v) {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v), indices.get(w)));
      }
    }
    if (lowlink.get(v) === indices.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      sccs.push(comp);
    }
  }

  for (const v of nodes) {
    if (!indices.has(v)) strongconnect(v);
  }

  const cyclicNodes = new Set();
  for (const comp of sccs) {
    if (comp.length > 1) {
      for (const id of comp) cyclicNodes.add(id);
    } else {
      const id = comp[0];
      if ((adj.get(id) || []).includes(id)) cyclicNodes.add(id);
    }
  }

  const cycleKeys = new Set();
  for (const e of edges) {
    if (cyclicNodes.has(e.from) && cyclicNodes.has(e.to)) {
      cycleKeys.add(`${e.from}->${e.to}`);
    }
  }
  return { cycleKeys, cyclicNodes: [...cyclicNodes] };
}

/**
 * Resolve successor/predecessor ids (v2 names preferred; legacy from/to).
 * from = successor; to = predecessor (HOW legacy).
 */
function resolveEdgeEndpoints(edge) {
  const successorTaskId = String(
    edge?.successorTaskId || edge?.from || edge?.successorId || ''
  ).trim();
  const predecessorTaskId = String(
    edge?.predecessorTaskId || edge?.to || edge?.predecessorId || ''
  ).trim();
  return { from: successorTaskId, to: predecessorTaskId };
}

/**
 * Resolve depType from events (preferred) or legacy depType→events.
 * @returns {{ ok: true, depType: string, predecessorEvent: string, successorEvent: string }|{ ok: false, rejection: object }}
 */
function resolveDepTypeFromEdge(edge, from, to) {
  let predecessorEvent = normalizeDepEvent(edge?.predecessorEvent);
  let successorEvent = normalizeDepEvent(edge?.successorEvent);
  const llmType = depTypeOf(edge?.depType);

  if (!predecessorEvent && !successorEvent && llmType) {
    const inferred = eventsFromDepType(llmType);
    if (inferred) {
      predecessorEvent = inferred.predecessorEvent;
      successorEvent = inferred.successorEvent;
    }
  }

  if (!predecessorEvent || !successorEvent) {
    return {
      ok: false,
      rejection: {
        reason: 'type_unresolved',
        from,
        to,
        predecessorEvent: predecessorEvent || null,
        successorEvent: successorEvent || null,
      },
    };
  }

  const mapped = mapEventsToDepType(predecessorEvent, successorEvent);
  if (!mapped) {
    return {
      ok: false,
      rejection: {
        reason: 'type_unresolved',
        from,
        to,
        predecessorEvent,
        successorEvent,
      },
    };
  }

  if (llmType && llmType !== mapped) {
    return {
      ok: false,
      rejection: {
        reason: 'event_type_mismatch',
        from,
        to,
        depType: llmType,
        mappedDepType: mapped,
        predecessorEvent,
        successorEvent,
      },
    };
  }

  return { ok: true, depType: mapped, predecessorEvent, successorEvent };
}

/**
 * INTEGRATION may schedule only when LLM mapped successor endpoint to a gate leaf
 * (gateTaskId === successor / from, in ALLOW). Otherwise refinement OQ.
 */
function isIntegrationGateMapped(edge, from, known) {
  const gateId = String(edge?.gateTaskId || edge?.mappedGateTaskId || '').trim();
  if (!gateId || !known.has(gateId)) return false;
  return gateId === from;
}

/**
 * Accept one LLM edge into proposal (may still be non-schedulable).
 */
function acceptLlmEdge(edge, known, byId, facts) {
  const { from, to } = resolveEdgeEndpoints(edge);
  if (!from || !to || from === to) {
    return { ok: false, rejection: { reason: 'bad_endpoints', from, to } };
  }
  if (!known.has(from) || !known.has(to)) {
    return { ok: false, rejection: { reason: 'task_not_in_allow', from, to } };
  }

  const typeResolved = resolveDepTypeFromEdge(edge, from, to);
  if (!typeResolved.ok) {
    return typeResolved;
  }
  const { depType, predecessorEvent, successorEvent } = typeResolved;

  const reason = clip(
    edge?.reason || edge?.constraintStatement || '',
    200
  );
  if (!reason) return { ok: false, rejection: { reason: 'missing_reason', from, to } };

  const requiredOutput = clip(edge?.requiredOutput || '', 200);
  if (!requiredOutput) {
    return { ok: false, rejection: { reason: 'missing_required_output', from, to } };
  }

  let basis = String(edge?.basis || 'INFERRED').trim().toUpperCase();
  if (!BASIS.has(basis)) basis = 'INFERRED';

  let requiredAt = String(edge?.requiredAt || 'FULL').trim().toUpperCase();
  if (!REQUIRED_AT.has(requiredAt)) requiredAt = 'FULL';

  const evidenceRefs = evidenceRefsOf(edge);
  if (!evidenceRefs?.length) {
    return { ok: false, rejection: { reason: 'missing_evidence', from, to } };
  }
  for (const id of evidenceRefs) {
    const cited = byId.get(id);
    if (!cited || !evidenceBelongsToEdge(cited, from, to, facts)) {
      return { ok: false, rejection: { reason: 'evidence_mismatch', from, to, evidenceRef: id } };
    }
  }

  if (basis === 'EXPLICIT' && !hasExplicitDependsOn(facts, from, to)) {
    const hasDependsEvidence = evidenceRefs.some((id) => {
      const c = byId.get(id);
      return c && c.field === 'dependsOn' && (c.taskId === from || c.taskId === to);
    });
    if (!hasDependsEvidence) basis = 'INFERRED';
  }

  const assumptions = Array.isArray(edge?.assumptions)
    ? edge.assumptions.map((a) => clip(a, 120)).filter(Boolean).slice(0, 6)
    : [];

  const lagRaw = Number(edge?.lagHours);
  const lagHours = Number.isFinite(lagRaw) ? Math.max(0, Math.round(lagRaw)) : 0;

  const constraintStatement = clip(edge?.constraintStatement || reason, 240);
  const gateTaskId = String(edge?.gateTaskId || edge?.mappedGateTaskId || '').trim() || null;

  return {
    ok: true,
    edge: {
      from,
      to,
      predecessorTaskId: to,
      successorTaskId: from,
      predecessorEvent,
      successorEvent,
      constraintStatement,
      depType,
      lagHours,
      requiredOutput,
      requiredAt,
      basis,
      reason,
      title: clip(reason, 120),
      summary: reason,
      evidenceRefs,
      assumptions,
      ...(gateTaskId ? { gateTaskId } : {}),
      source: 'llm',
      provenance: { type: 'AI', source: 'dependency_sec' },
      decisionStatus: 'PROPOSED',
      schedulable: false,
    },
  };
}

const PARTIAL_OQ_CODES = new Set([
  'DEP_NON_FS',
  'DEP_CYCLE',
  'DEP_WBS_REFINEMENT_REQUIRED',
  'DEP_TYPE_UNRESOLVED',
]);

function isMissingDataOpenQuestion(q) {
  const code = String(q?.code || '');
  if (!code || code === 'DEP_EMPTY' || code === 'DEP_LLM_SKIP' || code === 'DEP_LLM_FAILED') {
    return false;
  }
  if (PARTIAL_OQ_CODES.has(code)) return false;
  return code === 'DEP_OQ' || code.startsWith('DEP_');
}

function resolveAnalysisFlags({
  proposeMeta = {},
  proposalEdges = [],
  schedulableEdges = [],
  openQuestions = [],
  cycleKeys = new Set(),
} = {}) {
  const fallback = String(proposeMeta.fallbackReason || proposeMeta.source || '');
  const llmOk = proposeMeta.ok === true || proposeMeta.source === 'fact_llm';

  if (fallback === 'LLM_off' || fallback === 'llm_disabled' || proposeMeta.analysisStatus === 'SKIPPED') {
    return {
      analysisStatus: ANALYSIS_STATUS.SKIPPED,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: false,
    };
  }
  if (
    fallback === 'llm_failed' ||
    fallback === 'parse_empty' ||
    fallback === 'llm_skipped' ||
    proposeMeta.analysisStatus === 'FAILED'
  ) {
    return {
      analysisStatus: ANALYSIS_STATUS.FAILED,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: false,
    };
  }
  if (proposeMeta.analysisStatus === 'SEMANTIC_INCOMPLETE' || fallback === 'semantic_incomplete') {
    return {
      analysisStatus: ANALYSIS_STATUS.SEMANTIC_INCOMPLETE,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: false,
    };
  }

  const missingDataOq = openQuestions.filter(isMissingDataOpenQuestion);
  const hasCycle = cycleKeys.size > 0;
  const hasNonSchedulableProposal = proposalEdges.some((e) => !e.schedulable);
  const hasPartialOq = openQuestions.some((q) => PARTIAL_OQ_CODES.has(String(q.code || '')));

  // Cycle first — never treat as COMPLETE_NO_EDGES
  if (hasCycle && !schedulableEdges.length) {
    return {
      analysisStatus: ANALYSIS_STATUS.INVALID,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: false,
    };
  }

  if (hasCycle || hasNonSchedulableProposal || hasPartialOq) {
    return {
      analysisStatus: ANALYSIS_STATUS.PARTIAL,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: schedulableEdges.length > 0,
    };
  }

  if (llmOk && !proposalEdges.length && !missingDataOq.length) {
    return {
      analysisStatus: ANALYSIS_STATUS.COMPLETE_NO_EDGES,
      executionTerminal: true,
      analysisComplete: true,
      scheduleReady: true,
    };
  }

  if (llmOk && missingDataOq.length && !schedulableEdges.length) {
    return {
      analysisStatus: ANALYSIS_STATUS.INCOMPLETE,
      executionTerminal: true,
      analysisComplete: false,
      scheduleReady: false,
    };
  }

  if (schedulableEdges.length) {
    return {
      analysisStatus: ANALYSIS_STATUS.DEPENDENCIES_FOUND,
      executionTerminal: true,
      analysisComplete: true,
      scheduleReady: true,
    };
  }

  return {
    analysisStatus: ANALYSIS_STATUS.INCOMPLETE,
    executionTerminal: true,
    analysisComplete: false,
    scheduleReady: false,
  };
}

function acceptDependencyProposal({
  raw = null,
  facts = null,
  openQuestionsIn = [],
  proposeMeta = {},
} = {}) {
  const known = new Set(facts?.allowLists?.taskIds || []);
  const catalog = buildDependencyEvidenceCatalog(facts);
  const rejectedInvent = [];
  const openQuestions = [];

  for (const q of openQuestionsIn || []) {
    const normalized = normalizeOpenQuestion(q, known, rejectedInvent);
    if (normalized) openQuestions.push(normalized);
  }
  for (const q of raw?.openQuestions || []) {
    const normalized = normalizeOpenQuestion(q, known, rejectedInvent);
    if (normalized) openQuestions.push(normalized);
  }

  const proposalEdges = [];
  const seen = new Set();

  for (const e of raw?.edges || []) {
    const source = String(e?.source || '').toLowerCase();
    // No heuristic passthrough — only LLM / unset source.
    if (source === 'candidate' || source === 'srs' || source === 'deterministic') {
      rejectedInvent.push({
        reason: 'heuristic_passthrough_forbidden',
        from: e.from,
        to: e.to,
      });
      continue;
    }
    const accepted = acceptLlmEdge(e, known, catalog.byId, facts);
    if (!accepted.ok) {
      rejectedInvent.push(accepted.rejection);
      const rej = accepted.rejection || {};
      if (rej.reason === 'type_unresolved') {
        openQuestions.push({
          code: 'DEP_TYPE_UNRESOLVED',
          message: clip(
            `Chưa xác định được hai mốc ràng buộc cho ${rej.from || '?'}←${rej.to || '?'} — không mặc định FS.`,
            240
          ),
          relatedTaskIds: [rej.from, rej.to].filter((id) => id && known.has(id)),
        });
      }
      continue;
    }
    const key = `${accepted.edge.from}->${accepted.edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    proposalEdges.push(accepted.edge);
  }

  // Schedulable candidates: FS lag 0 + mapped endpoint/gate (RULE-DEP-SCHED-01/02)
  const fsCandidates = [];
  for (const edge of proposalEdges) {
    if (edge.depType !== 'FS') {
      openQuestions.push({
        code: 'DEP_NON_FS',
        message: clip(
          `Quan hệ ${edge.depType} ${edge.from}→${edge.to} chưa được engine lịch hỗ trợ (chỉ FS lag 0).`,
          240
        ),
        relatedTaskIds: [edge.from, edge.to],
      });
      continue;
    }
    if (Number(edge.lagHours) > 0) {
      openQuestions.push({
        code: 'DEP_NON_FS',
        message: clip(
          `Lag ${edge.lagHours}h trên ${edge.from}→${edge.to} chưa được engine lịch hỗ trợ (chỉ FS lag 0).`,
          240
        ),
        relatedTaskIds: [edge.from, edge.to],
      });
      continue;
    }
    if (edge.requiredAt === 'INTEGRATION' && !isIntegrationGateMapped(edge, edge.from, known)) {
      openQuestions.push({
        code: 'DEP_WBS_REFINEMENT_REQUIRED',
        message: clip(
          `Phụ thuộc tích hợp ${edge.from}←${edge.to} chưa ánh xạ tới gate/leaf hợp lệ — không ép FS full-task.`,
          240
        ),
        relatedTaskIds: [edge.from, edge.to],
      });
      continue;
    }
    fsCandidates.push(edge);
  }

  const { cycleKeys, cyclicNodes } = findCycleEdgeKeys(fsCandidates);
  if (cycleKeys.size) {
    openQuestions.push({
      code: 'DEP_CYCLE',
      message: clip(
        `Phát hiện chu trình trên cạnh lịch: ${[...cycleKeys].slice(0, 8).join(', ')}`,
        240
      ),
      relatedTaskIds: cyclicNodes.slice(0, 24),
    });
  }

  const schedulableEdges = [];
  for (const edge of proposalEdges) {
    const key = `${edge.from}->${edge.to}`;
    const integrationOk =
      edge.requiredAt !== 'INTEGRATION' || isIntegrationGateMapped(edge, edge.from, known);
    const canSchedule =
      edge.depType === 'FS' &&
      Number(edge.lagHours || 0) === 0 &&
      integrationOk &&
      !cycleKeys.has(key);
    edge.schedulable = canSchedule;
    if (canSchedule) {
      schedulableEdges.push({ ...edge, schedulable: true });
    }
  }

  // Legacy `edges` = schedulable only (CPM consumers)
  const edges = schedulableEdges;

  const flags = resolveAnalysisFlags({
    proposeMeta,
    proposalEdges,
    schedulableEdges,
    openQuestions,
    cycleKeys,
  });

  if (
    !proposalEdges.length &&
    !openQuestions.length &&
    flags.analysisStatus === ANALYSIS_STATUS.COMPLETE_NO_EDGES
  ) {
    // intentional empty — no DEP_EMPTY noise
  } else if (!proposalEdges.length && !openQuestions.length && flags.analysisComplete) {
    openQuestions.push({
      code: 'DEP_EMPTY',
      message: 'Không có phụ thuộc hợp lệ sau Accept.',
    });
  }

  const tasks = (facts?.allowLists?.taskIds || []).map((id) => ({ id }));
  return {
    edges,
    proposalEdges,
    schedulableEdges,
    orderHint: buildOrderHint(tasks, edges),
    openQuestions,
    rejectedInvent,
    analysisStatus: flags.analysisStatus,
    executionTerminal: flags.executionTerminal,
    analysisComplete: flags.analysisComplete,
    scheduleReady: flags.scheduleReady,
    meta: {
      source:
        flags.analysisStatus === ANALYSIS_STATUS.SKIPPED
          ? 'llm_skipped'
          : flags.analysisStatus === ANALYSIS_STATUS.FAILED
            ? 'llm_failed'
            : flags.analysisStatus === ANALYSIS_STATUS.SEMANTIC_INCOMPLETE
              ? 'semantic_incomplete'
              : 'fact_llm',
      fallbackReason: proposeMeta?.fallbackReason || null,
      edgeCount: edges.length,
      proposalCount: proposalEdges.length,
      rejectedCount: rejectedInvent.length,
      inventForbidden: true,
      cycleEdgeCount: cycleKeys.size,
    },
  };
}

function toDependencyEngineResult(
  accepted,
  {
    model = null,
    llmCalls = 0,
    providerAttempts = 0,
    analyzedTaskIds = null,
    inputHash = null,
    wbsVersion = null,
    promptVersion = null,
    runId = null,
    attemptId = null,
  } = {}
) {
  const edges = accepted.edges || [];
  const analyzed = Array.isArray(analyzedTaskIds)
    ? analyzedTaskIds.map(String).filter(Boolean)
    : [];
  const analysisStatus = accepted.analysisStatus || ANALYSIS_STATUS.INCOMPLETE;
  const scheduleReady = Boolean(accepted.scheduleReady);
  const analysisComplete = Boolean(accepted.analysisComplete);
  const executionTerminal = accepted.executionTerminal !== false;

  return {
    status: analysisComplete && scheduleReady ? 'ready' : 'partial',
    analysisStatus,
    executionTerminal,
    analysisComplete,
    scheduleReady,
    model,
    generatedAt: new Date().toISOString(),
    edges,
    proposalEdges: accepted.proposalEdges || [],
    schedulableEdges: accepted.schedulableEdges || edges,
    orderHint: accepted.orderHint || [],
    openQuestions: accepted.openQuestions || [],
    unresolvedQuestions: accepted.openQuestions || [],
    assessment: {
      coverageComplete: analysisComplete,
      unresolvedCount: (accepted.openQuestions || []).length,
      conclusion: analysisStatus,
      analyzedTaskIds: analyzed,
    },
    inputHash,
    wbsVersion,
    promptVersion,
    runId,
    attemptId,
    meta: {
      ...(accepted.meta || {}),
      llmCalls,
      providerAttempts: providerAttempts || llmCalls,
      rejectedInvent: accepted.rejectedInvent || [],
      coverageVerified: analysisStatus === ANALYSIS_STATUS.COMPLETE_NO_EDGES,
      analyzedTaskIds: analyzed,
      analysisStatus,
      executionTerminal,
      analysisComplete,
      scheduleReady,
      inputHash,
      wbsVersion,
      promptVersion,
    },
  };
}

module.exports = {
  ANALYSIS_STATUS,
  acceptDependencyProposal,
  acceptLlmEdge,
  toDependencyEngineResult,
  applyDependencyToContainer,
  findCycleEdgeKeys,
  resolveAnalysisFlags,
  resolveEdgeEndpoints,
  resolveDepTypeFromEdge,
  isIntegrationGateMapped,
};
