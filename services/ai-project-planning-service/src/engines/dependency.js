/**
 * Dependency analysis — edges from task order / explicit dependsOn.
 */

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function taskId(task, index = 0) {
  return String(task?.id || task?.taskId || `TASK-${index + 1}`).trim();
}

function parseDependsOn(task) {
  const raw = task.dependsOn || task.dependencies || task.dependency;
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t?.id || t || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Build edges: explicit dependsOn first, then sequential order within same area.
 */
function buildHeuristicDependencyEdges(tasks = []) {
  const edges = [];
  const known = new Set(tasks.map((t, i) => taskId(t, i)).filter(Boolean));
  let idx = 0;

  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    const from = taskId(task, i);
    for (const to of parseDependsOn(task)) {
      if (!to || to === from) continue;
      if (!known.has(to)) continue;
      idx += 1;
      edges.push({
        edgeId: `DEP-X-${slugPart(from)}-${slugPart(to)}-${idx}`,
        from,
        to,
        kind: 'depends_on',
        type: 'internal',
        critical: false,
        blocking: true,
        evidence: 'explicit_dependsOn',
        source: 'explicit',
      });
    }
  }

  const byArea = new Map();
  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    const id = taskId(task, i);
    const area = String(task.area || 'general').toLowerCase();
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push({ id, sortOrder: Number(task.sortOrder) || i });
  }
  for (const [, list] of byArea) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const cur = list[i];
      const already = edges.some((e) => e.from === cur.id && e.to === prev.id);
      if (already) continue;
      idx += 1;
      edges.push({
        edgeId: `DEP-H-${slugPart(cur.id)}-${slugPart(prev.id)}-${idx}`,
        from: cur.id,
        to: prev.id,
        kind: 'precedes',
        type: 'technical',
        critical: false,
        blocking: false,
        evidence: 'same_area_task_order',
        source: 'heuristic',
      });
    }
  }

  return edges;
}

function buildOrderHint(tasks = [], edges = []) {
  const ids = tasks.map((t, i) => taskId(t, i)).filter(Boolean);
  if (!edges.length) return ids;
  const indegree = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    // from depends on to → to before from
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

function runDependencyEngine(container = {}) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const edges = buildHeuristicDependencyEdges(tasks);
  const orderHint = buildOrderHint(tasks, edges);
  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    edges,
    orderHint,
    meta: {
      source: 'heuristic',
      llmCalls: 0,
      edgeCount: edges.length,
      taskCount: tasks.length,
    },
  };
}

function applyDependencyToContainer(container, depResult) {
  const next = {
    ...container,
    analyses: { ...(container?.analyses || {}) },
  };
  next.analyses.dependency = {
    status: depResult.status || 'ready',
    model: depResult.model || null,
    generatedAt: depResult.generatedAt || new Date().toISOString(),
    items: [],
    entities: [],
    edges: depResult.edges || [],
    dataFlows: [],
    orderHint: depResult.orderHint || [],
    meta: depResult.meta || {},
  };
  return next;
}

module.exports = {
  buildHeuristicDependencyEdges,
  buildOrderHint,
  runDependencyEngine,
  applyDependencyToContainer,
};
