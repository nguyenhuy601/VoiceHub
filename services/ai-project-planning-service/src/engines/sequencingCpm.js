/**
 * Deterministic CPM. The engine owns ES/EF/LS/LF, float, and the critical path.
 * Legacy edges (from = successor, to = predecessor) are normalized once here.
 */
const FLOAT_EPSILON = 1e-6;
const KNOWN_DEPENDENCY_TYPES = new Set(['FS', 'SS', 'FF', 'SF']);
const PATH_SELECTION = 'max_duration_then_count_then_id';

function taskIdOf(task) {
  return String(task?.id || task?.taskId || '').trim();
}

function roundHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours)) return 0;
  return Math.round(hours * 1000) / 1000;
}

function explicitDependencyType(row) {
  for (const value of [row?.type, row?.depType, row?.relationship]) {
    const upper = String(value || '').trim().toUpperCase();
    if (KNOWN_DEPENDENCY_TYPES.has(upper)) return upper;
  }
  return null;
}

/**
 * One input shape for CPM: predecessor happens before successor.
 * Schema-v2 dependencies win. Otherwise legacy from/to is converted here.
 */
function normalizeDependencyLinks({ dependencies = null, edges = null } = {}) {
  const useDependencies = Array.isArray(dependencies) && dependencies.length > 0;
  const rows = useDependencies ? dependencies : Array.isArray(edges) ? edges : [];
  const links = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    if (String(row?.status || row?.decisionStatus || '').toUpperCase() === 'REJECTED') return;
    let predecessorId = String(row?.predecessorTaskId || row?.predecessorId || '').trim();
    let successorId = String(row?.successorTaskId || row?.successorId || '').trim();
    if (!predecessorId || !successorId) {
      successorId = String(row?.from || '').trim();
      predecessorId = String(row?.to || '').trim();
    }
    const key = `${predecessorId}->${successorId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const explicitType = explicitDependencyType(row);
    const lagRaw = row?.lagHours ?? row?.lag;
    const lagHours = lagRaw == null || lagRaw === '' ? 0 : Number(lagRaw);
    links.push({
      id: String(row?.id || row?.edgeId || `DEP-${index + 1}`),
      predecessorId,
      successorId,
      type: explicitType || 'FS',
      lagHours,
      source: String(row?.source || (useDependencies ? 'DEPENDENCY' : 'LEGACY_EDGE')),
      status: String(row?.status || row?.decisionStatus || 'PROPOSED').toUpperCase(),
    });
  });
  return links;
}

function collectTaskDurations(tasks = []) {
  const ids = new Set();
  const durationById = new Map();
  const diagnostics = [];
  let missingTaskIdCount = 0;
  let sawDuration = false;
  let sawEffort = false;

  for (const task of tasks) {
    const id = taskIdOf(task);
    if (!id) {
      missingTaskIdCount += 1;
      continue;
    }
    if (ids.has(id)) continue;
    ids.add(id);
    const duration = Number(task?.durationHours);
    const effort = Number(task?.effortHours);
    const hasDuration = task?.durationHours != null && task?.durationHours !== '';
    const hasEffort = task?.effortHours != null && task?.effortHours !== '';
    if (hasDuration && (!Number.isFinite(duration) || duration < 0)) {
      diagnostics.push({
        code: 'INVALID_DURATION',
        severity: 'BLOCKING',
        message: 'Task durationHours must be a finite number of zero or more.',
        affectedTaskIds: [id],
      });
      durationById.set(id, 0);
      continue;
    }
    if (!hasDuration && hasEffort && (!Number.isFinite(effort) || effort < 0)) {
      diagnostics.push({
        code: 'INVALID_DURATION',
        severity: 'BLOCKING',
        message: 'Task effortHours must be a finite number of zero or more.',
        affectedTaskIds: [id],
      });
      durationById.set(id, 0);
      continue;
    }
    if (hasDuration) {
      sawDuration = true;
      durationById.set(id, duration);
      continue;
    }
    sawEffort = true;
    durationById.set(id, Number.isFinite(effort) && effort > 0 ? effort : 0);
  }

  if (missingTaskIdCount) {
    diagnostics.push({
      code: 'MISSING_TASK_ID',
      severity: 'BLOCKING',
      message: 'One or more tasks have no id.',
      affectedTaskIds: [],
    });
  }

  let durationSource = 'effortHours';
  if (sawDuration && sawEffort) durationSource = 'mixed';
  else if (sawDuration) durationSource = 'durationHours';

  return { ids, durationById, diagnostics, missingTaskIdCount, durationSource };
}

function classifyLinks(ids, links) {
  const preds = new Map([...ids].map((id) => [id, new Set()]));
  const succs = new Map([...ids].map((id) => [id, new Set()]));
  const diagnostics = [];
  const graphLinks = [];
  let unresolvedDependencyCount = 0;
  let selfDependencyCount = 0;

  for (const link of links) {
    const pred = link.predecessorId;
    const succ = link.successorId;
    if (!pred || !succ || !ids.has(pred) || !ids.has(succ)) {
      unresolvedDependencyCount += 1;
      diagnostics.push({
        code: 'UNRESOLVED_REFERENCE',
        severity: 'WARNING',
        message: 'Dependency references a task that is not in the plan.',
        dependencyId: link.id,
        affectedTaskIds: [pred, succ].filter(Boolean),
      });
      continue;
    }
    if (pred === succ) {
      selfDependencyCount += 1;
      diagnostics.push({
        code: 'SELF_DEPENDENCY',
        severity: 'WARNING',
        message: 'A task cannot depend on itself. The schedule graph omits this edge.',
        dependencyId: link.id,
        affectedTaskIds: [pred],
      });
      graphLinks.push(link);
      continue;
    }
    if (link.type !== 'FS') {
      diagnostics.push({
        code: 'UNSUPPORTED_DEPENDENCY_TYPE',
        severity: 'BLOCKING',
        message: `Dependency type ${link.type} is not calculated. Only FS with lag 0 is supported.`,
        dependencyId: link.id,
        affectedTaskIds: [pred, succ],
      });
      continue;
    }
    if (!Number.isFinite(link.lagHours) || link.lagHours !== 0) {
      diagnostics.push({
        code: 'UNSUPPORTED_LAG',
        severity: 'BLOCKING',
        message: 'Non-zero lag is not calculated. Only FS with lag 0 is supported.',
        dependencyId: link.id,
        affectedTaskIds: [pred, succ],
      });
      continue;
    }
    preds.get(succ).add(pred);
    succs.get(pred).add(succ);
    graphLinks.push(link);
  }

  return {
    preds,
    succs,
    diagnostics,
    graphLinks,
    unresolvedDependencyCount,
    selfDependencyCount,
  };
}

function stronglyConnectedComponents(ids, succs) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const low = new Map();
  const components = [];

  function connect(id) {
    indices.set(id, index);
    low.set(id, index);
    index += 1;
    stack.push(id);
    onStack.add(id);
    for (const next of succs.get(id) || []) {
      if (!indices.has(next)) {
        connect(next);
        low.set(id, Math.min(low.get(id), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(id, Math.min(low.get(id), indices.get(next)));
      }
    }
    if (low.get(id) === indices.get(id)) {
      const component = [];
      let member = null;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== id);
      components.push(component);
    }
  }

  for (const id of [...ids].sort()) {
    if (!indices.has(id)) connect(id);
  }
  return components;
}

function findCycles(ids, succs, graphLinks) {
  const selfIds = new Set(
    graphLinks.filter((link) => link.predecessorId === link.successorId).map((link) => link.predecessorId)
  );
  const cycles = [];
  for (const component of stronglyConnectedComponents(ids, succs)) {
    const cyclic =
      component.length > 1 || (component.length === 1 && selfIds.has(component[0]));
    if (!cyclic) continue;
    const members = new Set(component);
    const dependencies = graphLinks
      .filter((link) => members.has(link.predecessorId) && members.has(link.successorId))
      .map((link) => ({
        id: link.id,
        predecessorId: link.predecessorId,
        successorId: link.successorId,
        type: link.type,
        source: link.source,
        status: link.status,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    cycles.push({
      taskIds: [...component].sort(),
      dependencyIds: dependencies.map((link) => link.id),
      dependencies,
      status: 'NEEDS_REVIEW',
    });
  }
  return cycles;
}

function buildAssumptions(durationSource) {
  return {
    durationSource,
    calendarAware: false,
    resourceAware: false,
    dependencyTypesSupported: ['FS'],
    defaultLagHours: 0,
    defaultRelationship: 'FS',
  };
}

function emptyTheoreticalCpm() {
  return {
    projectDurationHours: 0,
    criticalPath: [],
    criticalPathRole: 'representative',
    criticalPathSelection: PATH_SELECTION,
    nodes: [],
    tasks: [],
    sumEffortHours: 0,
    comparedToSumEffort: {
      sumEffortHours: 0,
      parallelOptimizedHours: 0,
      note: 'Comparison of summed task duration with CPM length. Not a plan-quality score.',
    },
  };
}

function blockedSequencingResult({
  status,
  graphValidation,
  assumptions,
  diagnostics,
  opts,
}) {
  return {
    status,
    graphValidation,
    assumptions,
    diagnostics,
    sequence: {
      waves: [],
      partial: true,
      status,
      graphValidation,
      assumptions,
      diagnostics,
      criticalPath: null,
    },
    theoreticalCpm: null,
    criticalWorkIds: [],
    criticalPath: null,
    generatedAt: new Date().toISOString(),
    meta: {
      source: 'engine',
      llmCalls: 0,
      nodeCount: graphValidation.nodeCount,
      unresolvedEdgeCount: graphValidation.unresolvedDependencyCount,
      ...(opts.note ? { note: opts.note } : {}),
    },
  };
}

function topologicalLayers(ids, preds, succs) {
  const indegree = new Map();
  for (const id of ids) indegree.set(id, preds.get(id)?.size || 0);
  const waves = [];
  const remaining = new Set(ids);
  while (remaining.size) {
    const wave = [...remaining].filter((id) => (indegree.get(id) || 0) === 0).sort();
    if (!wave.length) break;
    waves.push(wave);
    for (const id of wave) {
      remaining.delete(id);
      for (const next of succs.get(id) || []) {
        indegree.set(next, Math.max(0, (indegree.get(next) || 0) - 1));
      }
    }
  }
  return { waves, unordered: [...remaining].sort() };
}

function topologicalOrder(ids, preds, succs) {
  const indegree = new Map();
  for (const id of ids) indegree.set(id, preds.get(id)?.size || 0);
  const queue = [...ids].filter((id) => indegree.get(id) === 0).sort();
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of [...(succs.get(id) || [])].sort()) {
      indegree.set(next, (indegree.get(next) || 0) - 1);
      if (indegree.get(next) === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }
  return order;
}

function forwardPass(order, durationById, preds) {
  const es = new Map();
  const ef = new Map();
  for (const id of order) {
    let start = 0;
    for (const predecessor of preds.get(id) || []) {
      start = Math.max(start, ef.get(predecessor) || 0);
    }
    const duration = durationById.get(id) || 0;
    es.set(id, roundHours(start));
    ef.set(id, roundHours(start + duration));
  }
  return { es, ef };
}

function backwardPass(order, durationById, succs, projectEnd) {
  const lf = new Map();
  const ls = new Map();
  for (const id of [...order].reverse()) {
    const next = [...(succs.get(id) || [])];
    const finish = next.length
      ? Math.min(...next.map((successor) => ls.get(successor)))
      : projectEnd;
    const duration = durationById.get(id) || 0;
    lf.set(id, roundHours(finish));
    ls.set(id, roundHours(finish - duration));
  }
  return { ls, lf };
}

function betterPath(candidate, current) {
  if (!current) return true;
  if (candidate.duration !== current.duration) return candidate.duration > current.duration;
  if (candidate.count !== current.count) return candidate.count > current.count;
  return candidate.path.join('\0') < current.path.join('\0');
}

function pickRepresentativeCriticalPath(ids, preds, succs, isCritical, durationById) {
  const criticalIds = [...ids].filter((id) => isCritical.get(id)).sort();
  const critical = new Set(criticalIds);
  const indegree = new Map(criticalIds.map((id) => [id, 0]));
  for (const id of criticalIds) {
    for (const successor of succs.get(id) || []) {
      if (critical.has(successor)) indegree.set(successor, (indegree.get(successor) || 0) + 1);
    }
  }
  const queue = criticalIds.filter((id) => indegree.get(id) === 0);
  const bestEnding = new Map();
  while (queue.length) {
    const id = queue.shift();
    let chosen = {
      duration: roundHours(durationById.get(id) || 0),
      count: 1,
      path: [id],
    };
    for (const predecessor of [...(preds.get(id) || [])].filter((item) => critical.has(item)).sort()) {
      const prev = bestEnding.get(predecessor);
      if (!prev) continue;
      const candidate = {
        duration: roundHours(prev.duration + (durationById.get(id) || 0)),
        count: prev.count + 1,
        path: [...prev.path, id],
      };
      if (betterPath(candidate, chosen)) chosen = candidate;
    }
    bestEnding.set(id, chosen);
    for (const successor of [...(succs.get(id) || [])].filter((item) => critical.has(item)).sort()) {
      indegree.set(successor, indegree.get(successor) - 1);
      if (indegree.get(successor) === 0) {
        queue.push(successor);
        queue.sort();
      }
    }
  }
  let winner = null;
  for (const id of criticalIds) {
    const path = bestEnding.get(id);
    if (path && betterPath(path, winner)) winner = path;
  }
  return winner ? winner.path : [];
}

function linkKey(link) {
  return `${link.predecessorId}->${link.successorId}`;
}

/** Lower rank is dropped first. Candidate proposals yield before confirmed or LLM edges. */
function cycleDropRank(link) {
  const status = String(link.status || '').toUpperCase();
  const source = String(link.source || '').toLowerCase();
  if (status === 'CONFIRMED') return 30;
  if (source === 'llm') return 20;
  if (source === 'srs') return 15;
  if (source === 'candidate') return 0;
  return 10;
}

function chooseCycleBackEdge(ids, succs, activeByKey) {
  const color = new Map();
  const backEdges = [];

  function visit(id) {
    color.set(id, 1);
    for (const next of [...(succs.get(id) || [])].sort()) {
      const state = color.get(next) || 0;
      if (state === 1) {
        const link = activeByKey.get(`${id}->${next}`);
        if (link) backEdges.push(link);
      } else if (state === 0) {
        visit(next);
      }
    }
    color.set(id, 2);
  }

  for (const id of [...ids].sort()) {
    if (!color.has(id)) visit(id);
  }
  backEdges.sort((a, b) => {
    const rank = cycleDropRank(a) - cycleDropRank(b);
    if (rank) return rank;
    return String(a.id).localeCompare(String(b.id));
  });
  return backEdges[0] || null;
}

/**
 * Leave stored dependencies untouched. Drop only the edges that close a cycle
 * from the schedule graph so CPM can still name one path to apply.
 */
function excludeCycleClosingEdges(ids, succsIn, graphLinks) {
  const dropped = [];
  const droppedKeys = new Set();
  const succs = new Map([...ids].map((id) => [id, new Set(succsIn.get(id) || [])]));
  let guard = graphLinks.length + 1;

  while (guard > 0) {
    guard -= 1;
    const activeLinks = graphLinks.filter((link) => !droppedKeys.has(linkKey(link)));
    const activeByKey = new Map(activeLinks.map((link) => [linkKey(link), link]));
    if (!findCycles(ids, succs, activeLinks).length) break;
    const back = chooseCycleBackEdge(ids, succs, activeByKey);
    if (!back) break;
    droppedKeys.add(linkKey(back));
    dropped.push(back);
    succs.get(back.predecessorId)?.delete(back.successorId);
  }

  const kept = graphLinks.filter((link) => !droppedKeys.has(linkKey(link)));
  const preds = new Map([...ids].map((id) => [id, new Set()]));
  const nextSuccs = new Map([...ids].map((id) => [id, new Set()]));
  for (const link of kept) {
    if (!preds.has(link.successorId) || !nextSuccs.has(link.predecessorId)) continue;
    preds.get(link.successorId).add(link.predecessorId);
    nextSuccs.get(link.predecessorId).add(link.successorId);
  }
  return { preds, succs: nextSuccs, graphLinks: kept, dropped };
}

function buildTaskGraph(tasks = [], edges = []) {
  const { ids, durationById } = collectTaskDurations(tasks);
  const links = normalizeDependencyLinks({ edges });
  const { preds, succs, unresolvedDependencyCount } = classifyLinks(ids, links);
  return {
    ids,
    durationById,
    preds,
    succs,
    unresolvedEdgeCount: unresolvedDependencyCount,
    droppedCycleEdgeCount: 0,
  };
}

function runSequencingCpm(container, opts = {}) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const analysis = container?.analyses?.dependency || {};
  const links = normalizeDependencyLinks({
    dependencies: analysis.dependencies,
    edges: analysis.edges,
  });
  const { ids, durationById, diagnostics: durationDiagnostics, missingTaskIdCount, durationSource } =
    collectTaskDurations(tasks);
  const classified = classifyLinks(ids, links);
  const diagnostics = [...durationDiagnostics, ...classified.diagnostics];
  let { preds, succs, graphLinks } = classified;
  let excludedCycleEdges = [];
  let cycles = findCycles(ids, succs, graphLinks);
  if (cycles.length) {
    const trimmed = excludeCycleClosingEdges(ids, succs, graphLinks);
    preds = trimmed.preds;
    succs = trimmed.succs;
    graphLinks = trimmed.graphLinks;
    excludedCycleEdges = trimmed.dropped;
    cycles = findCycles(ids, succs, graphLinks);
    const affectedTaskIds = [
      ...new Set(excludedCycleEdges.flatMap((link) => [link.predecessorId, link.successorId])),
    ].sort();
    diagnostics.push({
      code: 'DEPENDENCY_CYCLE',
      severity: cycles.length ? 'BLOCKING' : 'WARNING',
      message: cycles.length
        ? 'Dependency graph contains a cycle.'
        : 'Cycle-closing dependencies stay stored but are left out of the schedule graph so the critical path can be calculated.',
      affectedTaskIds,
      excludedDependencyIds: excludedCycleEdges.map((link) => link.id),
    });
  }

  const assumptions = buildAssumptions(durationSource);
  const graphValidation = {
    isDag: cycles.length === 0,
    cycles,
    excludedCycleEdges: excludedCycleEdges.map((link) => ({
      id: link.id,
      predecessorId: link.predecessorId,
      successorId: link.successorId,
      type: link.type,
      source: link.source,
      status: link.status,
    })),
    unresolvedDependencyCount: classified.unresolvedDependencyCount,
    selfDependencyCount: classified.selfDependencyCount,
    missingTaskIdCount,
    nodeCount: ids.size,
  };
  const blocking = diagnostics.some((item) => item.severity === 'BLOCKING');
  const status = cycles.length ? 'BLOCKED_CYCLE' : blocking ? 'BLOCKED_INPUT' : 'READY';

  if (status !== 'READY') {
    return blockedSequencingResult({
      status,
      graphValidation,
      assumptions,
      diagnostics,
      opts,
    });
  }

  const { waves, unordered } = topologicalLayers(ids, preds, succs);
  if (unordered.length) {
    return blockedSequencingResult({
      status: 'BLOCKED_CYCLE',
      graphValidation: { ...graphValidation, isDag: false },
      assumptions,
      diagnostics: [
        ...diagnostics,
        {
          code: 'DEPENDENCY_CYCLE',
          severity: 'BLOCKING',
          message: 'Dependency graph contains a cycle.',
          affectedTaskIds: unordered,
        },
      ],
      opts,
    });
  }

  const order = topologicalOrder(ids, preds, succs);
  const { es, ef } = forwardPass(order, durationById, preds);
  let projectEnd = 0;
  for (const id of ids) projectEnd = Math.max(projectEnd, ef.get(id) || 0);
  projectEnd = roundHours(projectEnd);
  const { ls, lf } = backwardPass(order, durationById, succs, projectEnd);

  const nodes = [];
  const isCritical = new Map();
  let sumDurationHours = 0;
  for (const id of [...ids].sort()) {
    const duration = roundHours(durationById.get(id) || 0);
    sumDurationHours = roundHours(sumDurationHours + duration);
    const totalFloat = roundHours((ls.get(id) || 0) - (es.get(id) || 0));
    const critical = Math.abs(totalFloat) <= FLOAT_EPSILON;
    isCritical.set(id, critical);
    nodes.push({
      workId: id,
      durationHours: duration,
      es: es.get(id) || 0,
      ef: ef.get(id) || 0,
      ls: ls.get(id) || 0,
      lf: lf.get(id) || 0,
      totalFloat,
      isCritical: critical,
    });
  }
  const criticalPath = pickRepresentativeCriticalPath(ids, preds, succs, isCritical, durationById);
  const criticalWorkIds = nodes.filter((node) => node.isCritical).map((node) => node.workId);
  const cpmTasks = nodes.map((node) => ({
    id: node.workId,
    es: node.es,
    ef: node.ef,
    ls: node.ls,
    lf: node.lf,
    totalFloat: node.totalFloat,
    critical: Boolean(node.isCritical),
  }));
  const criticalPathRecord = {
    representative: true,
    taskIds: criticalPath,
    selection: PATH_SELECTION,
  };

  return {
    status: 'READY',
    graphValidation,
    assumptions,
    diagnostics,
    sequence: {
      waves,
      partial: false,
      status: 'READY',
      graphValidation,
      assumptions,
      diagnostics,
      criticalPath: criticalPathRecord,
    },
    theoreticalCpm: {
      projectDurationHours: projectEnd,
      criticalPath,
      criticalPathRole: 'representative',
      criticalPathSelection: PATH_SELECTION,
      nodes,
      tasks: cpmTasks,
      sumEffortHours: sumDurationHours,
      comparedToSumEffort: {
        sumEffortHours: sumDurationHours,
        parallelOptimizedHours: projectEnd,
        note: 'Comparison of summed task duration with CPM length. Not a plan-quality score.',
      },
    },
    criticalWorkIds,
    criticalPath: criticalPathRecord,
    generatedAt: new Date().toISOString(),
    meta: {
      source: 'engine',
      llmCalls: 0,
      unresolvedEdgeCount: classified.unresolvedDependencyCount,
      nodeCount: ids.size,
      ...(opts.note ? { note: opts.note } : {}),
    },
  };
}

function applySequencingCpmToContainer(container, result) {
  const ready = result?.status === 'READY';
  return {
    ...container,
    planning: {
      ...(container?.planning || {}),
      sequence: result?.sequence || { waves: [], status: result?.status || 'BLOCKED_INPUT' },
      theoreticalCpm: ready ? result.theoreticalCpm : null,
      criticalWorkIds: ready ? result.criticalWorkIds || [] : [],
    },
  };
}

module.exports = {
  FLOAT_EPSILON,
  buildTaskGraph,
  topologicalLayers,
  runSequencingCpm,
  applySequencingCpmToContainer,
  forwardPass,
  backwardPass,
  normalizeDependencyLinks,
};
