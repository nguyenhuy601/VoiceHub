/**
 * Ported from project-service/src/utils/aiAnalysis/aiAnalysisSequencingCpm.js.
 */
const FLOAT_EPSILON = 1e-6;

function taskIdOf(task) {
  return String(task?.id || task?.taskId || '').trim();
}

function effortHoursOf(task) {
  const hours = Number(task?.effortHours);
  if (!Number.isFinite(hours) || hours < 0) return 0;
  return hours;
}

function buildTaskGraph(tasks = [], edges = []) {
  const ids = new Set();
  const durationById = new Map();
  for (const task of tasks) {
    const id = taskIdOf(task);
    if (!id) continue;
    ids.add(id);
    durationById.set(id, effortHoursOf(task));
  }
  const preds = new Map([...ids].map((id) => [id, new Set()]));
  const succs = new Map([...ids].map((id) => [id, new Set()]));
  let unresolvedEdgeCount = 0;
  for (const edge of edges) {
    const from = String(edge?.from || '').trim();
    const to = String(edge?.to || '').trim();
    if (!from || !to || from === to) continue;
    if (!ids.has(from) || !ids.has(to)) {
      unresolvedEdgeCount += 1;
      continue;
    }
    preds.get(from).add(to);
    succs.get(to).add(from);
  }
  return { ids, durationById, preds, succs, unresolvedEdgeCount };
}

function topologicalLayers(ids, preds, succs) {
  const indegree = new Map();
  for (const id of ids) indegree.set(id, preds.get(id)?.size || 0);
  const waves = [];
  const remaining = new Set(ids);
  while (remaining.size) {
    const wave = [...remaining].filter((id) => (indegree.get(id) || 0) === 0).sort();
    if (!wave.length) {
      waves.push([...remaining].sort());
      break;
    }
    waves.push(wave);
    for (const id of wave) {
      remaining.delete(id);
      for (const next of succs.get(id) || []) {
        indegree.set(next, Math.max(0, (indegree.get(next) || 0) - 1));
      }
    }
  }
  return waves;
}

function forwardPass(ids, durationById, preds, succs) {
  const es = new Map();
  const ef = new Map();
  const order = [];
  const indegree = new Map();
  for (const id of ids) indegree.set(id, preds.get(id)?.size || 0);
  const queue = [...ids].filter((id) => indegree.get(id) === 0).sort();
  const remaining = new Set(ids);
  while (queue.length) {
    const id = queue.shift();
    if (!remaining.has(id)) continue;
    remaining.delete(id);
    order.push(id);
    let start = 0;
    for (const predecessor of preds.get(id) || []) {
      start = Math.max(start, ef.get(predecessor) || 0);
    }
    const duration = durationById.get(id) || 0;
    es.set(id, start);
    ef.set(id, start + duration);
    for (const next of succs.get(id) || []) {
      indegree.set(next, (indegree.get(next) || 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
    queue.sort();
  }
  for (const id of remaining) {
    order.push(id);
    es.set(id, 0);
    ef.set(id, durationById.get(id) || 0);
  }
  return { es, ef, order };
}

function backwardPass(ids, durationById, succs, ef, projectEnd) {
  const lf = new Map();
  const ls = new Map();
  const order = [...ids].sort((a, b) => (ef.get(b) || 0) - (ef.get(a) || 0));
  for (const id of order) {
    const next = [...(succs.get(id) || [])];
    const finish = next.length
      ? Math.min(...next.map((successor) => ls.get(successor) ?? projectEnd))
      : projectEnd;
    const duration = durationById.get(id) || 0;
    lf.set(id, finish);
    ls.set(id, finish - duration);
  }
  return { ls, lf };
}

function pickCriticalPath(ids, succs, isCritical, es, ef) {
  const starts = [...ids].filter((id) => isCritical.get(id) && (es.get(id) || 0) === 0);
  let best = [];
  function visit(id, path) {
    const nextPath = [...path, id];
    const next = [...(succs.get(id) || [])].filter((successor) => isCritical.get(successor));
    if (!next.length) {
      if (nextPath.length > best.length) best = nextPath;
      else if (nextPath.length === best.length) {
        const length = nextPath.reduce(
          (sum, value) => sum + ((ef.get(value) || 0) - (es.get(value) || 0)),
          0
        );
        const bestLength = best.reduce(
          (sum, value) => sum + ((ef.get(value) || 0) - (es.get(value) || 0)),
          0
        );
        if (length > bestLength) best = nextPath;
      }
      return;
    }
    for (const successor of next.sort()) visit(successor, nextPath);
  }
  const seeds = starts.length ? starts : [...ids].filter((id) => isCritical.get(id));
  for (const seed of seeds.sort()) visit(seed, []);
  return best;
}

function runSequencingCpm(container, opts = {}) {
  const tasks = container?.planning?.tasks || [];
  const edges = container?.analyses?.dependency?.edges || [];
  const { ids, durationById, preds, succs, unresolvedEdgeCount } =
    buildTaskGraph(tasks, edges);
  if (!ids.size) {
    return {
      sequence: { waves: [] },
      theoreticalCpm: {
        projectDurationHours: 0,
        criticalPath: [],
        nodes: [],
        sumEffortHours: 0,
      },
      criticalWorkIds: [],
      meta: { source: 'engine', llmCalls: 0, unresolvedEdgeCount, nodeCount: 0 },
      generatedAt: new Date().toISOString(),
    };
  }
  const waves = topologicalLayers(ids, preds, succs);
  const { es, ef } = forwardPass(ids, durationById, preds, succs);
  let projectEnd = 0;
  for (const id of ids) projectEnd = Math.max(projectEnd, ef.get(id) || 0);
  const { ls, lf } = backwardPass(ids, durationById, succs, ef, projectEnd);

  const nodes = [];
  const isCritical = new Map();
  let sumEffortHours = 0;
  for (const id of [...ids].sort()) {
    const duration = durationById.get(id) || 0;
    sumEffortHours += duration;
    const totalFloat = Math.round(((ls.get(id) || 0) - (es.get(id) || 0)) * 1000) / 1000;
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
  const criticalPath = pickCriticalPath(ids, succs, isCritical, es, ef);
  const criticalWorkIds = nodes.filter((node) => node.isCritical).map((node) => node.workId);

  return {
    sequence: { waves },
    theoreticalCpm: {
      projectDurationHours: projectEnd,
      criticalPath,
      nodes,
      sumEffortHours,
      comparedToSumEffort: {
        sumEffortHours,
        parallelOptimizedHours: projectEnd,
      },
    },
    criticalWorkIds,
    generatedAt: new Date().toISOString(),
    meta: {
      source: 'engine',
      llmCalls: 0,
      unresolvedEdgeCount,
      nodeCount: ids.size,
      ...(opts.note ? { note: opts.note } : {}),
    },
  };
}

function applySequencingCpmToContainer(container, result) {
  return {
    ...container,
    planning: {
      ...(container?.planning || {}),
      sequence: result.sequence,
      theoreticalCpm: result.theoreticalCpm,
      criticalWorkIds: result.criticalWorkIds,
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
};
