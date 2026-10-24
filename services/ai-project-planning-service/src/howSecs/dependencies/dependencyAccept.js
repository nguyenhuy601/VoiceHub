/**
 * Dependency Accept — only real task ids; no invent edges.
 */

const { applyDependencyToContainer } = require('../../engines/dependency');
const { buildDependencyEvidenceCatalog, depTypeOf } = require('./dependencyFacts');

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

/**
 * LLM edge contract. from = successor, to = predecessor.
 * Every evidenceRef must be a catalog id for that same pair.
 */
function acceptLlmEdge(edge, known, byId) {
  const from = String(edge?.from || '').trim();
  const to = String(edge?.to || '').trim();
  if (!from || !to || from === to) return { ok: false, rejection: { reason: 'bad_endpoints', from, to } };
  if (!known.has(from) || !known.has(to)) {
    return { ok: false, rejection: { reason: 'task_not_in_allow', from, to } };
  }
  const depType = depTypeOf(edge?.depType);
  if (!depType) return { ok: false, rejection: { reason: 'bad_dep_type', from, to } };
  const reason = clip(edge?.reason || '', 200);
  if (!reason) return { ok: false, rejection: { reason: 'missing_reason', from, to } };
  const evidenceRefs = evidenceRefsOf(edge);
  if (!evidenceRefs?.length) return { ok: false, rejection: { reason: 'missing_evidence', from, to } };
  for (const id of evidenceRefs) {
    const cited = byId.get(id);
    if (!cited || cited.from !== from || cited.to !== to) {
      return { ok: false, rejection: { reason: 'evidence_mismatch', from, to, evidenceRef: id } };
    }
  }
  return {
    ok: true,
    edge: {
      from,
      to,
      depType,
      reason,
      title: clip(reason, 120),
      summary: reason,
      evidenceRefs,
      source: 'llm',
      provenance: { type: 'AI', source: 'dependency_sec' },
    },
  };
}

function acceptDependencyProposal({
  raw = null,
  facts = null,
  openQuestionsIn = [],
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

  const edges = [];
  const seen = new Set();
  const pushEdge = (edge) => {
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  };

  for (const e of raw?.edges || []) {
    const accepted = acceptLlmEdge(e, known, catalog.byId);
    if (!accepted.ok) {
      rejectedInvent.push(accepted.rejection);
      continue;
    }
    pushEdge(accepted.edge);
  }

  if (!edges.length && !openQuestions.length) {
    openQuestions.push({
      code: 'DEP_EMPTY',
      message: 'Không có phụ thuộc hợp lệ từ LLM trên task thật.',
    });
  }

  const tasks = (facts?.allowLists?.taskIds || []).map((id) => ({ id }));
  return {
    edges,
    orderHint: buildOrderHint(tasks, edges),
    openQuestions,
    rejectedInvent,
    meta: {
      source: edges.some((e) => e.source === 'llm') ? 'fact_llm' : 'empty',
      edgeCount: edges.length,
      rejectedCount: rejectedInvent.length,
      inventForbidden: true,
    },
  };
}

function toDependencyEngineResult(accepted, { model = null, llmCalls = 0, candidateTool = null } = {}) {
  return {
    status: accepted.edges?.length ? 'ready' : 'partial',
    model,
    generatedAt: new Date().toISOString(),
    edges: accepted.edges || [],
    orderHint: accepted.orderHint || [],
    openQuestions: accepted.openQuestions || [],
    candidateTool: candidateTool || null,
    meta: {
      ...(accepted.meta || {}),
      llmCalls,
      candidateCount: candidateTool?.data?.candidates?.length || 0,
      rejectedInvent: accepted.rejectedInvent || [],
    },
  };
}

module.exports = {
  acceptDependencyProposal,
  acceptLlmEdge,
  toDependencyEngineResult,
  applyDependencyToContainer,
};
