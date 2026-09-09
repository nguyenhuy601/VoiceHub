/**
 * Sequencing + Theoretical CPM (engine-only) — waves, ES/EF/LS/LF, float, critical path.
 */

const FLOAT_EPSILON = 1e-6;

function taskIdOf(t) {
  return String(t?.id || t?.taskId || '').trim();
}

function effortHoursOf(t) {
  const n = Number(t?.effortHours);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Build adjacency from dependency edges onto known task ids.
 * Edge semantics (existing dep engine): `to` before `from` (from depends on to).
 */
function buildTaskGraph(tasks = [], edges = []) {
  const ids = new Set();
  const durationById = new Map();
  for (const t of tasks || []) {
    const id = taskIdOf(t);
    if (!id) continue;
    ids.add(id);
    durationById.set(id, effortHoursOf(t));
  }

  const preds = new Map();
  const succs = new Map();
  for (const id of ids) {
    preds.set(id, new Set());
    succs.set(id, new Set());
  }

  let unresolvedEdgeCount = 0;
  for (const e of edges || []) {
    const from = String(e.from || '').trim();
    const to = String(e.to || '').trim();
    if (!from || !to || from === to) continue;
    if (!ids.has(from) || !ids.has(to)) {
      unresolvedEdgeCount += 1;
      continue;
    }
    // from depends on to → to is predecessor of from
    preds.get(from).add(to);
    succs.get(to).add(from);
  }

  return { ids, durationById, preds, succs, unresolvedEdgeCount };
}

function topologicalLayers(ids, preds, succs) {
  const indeg = new Map();
  for (const id of ids) indeg.set(id, preds.get(id)?.size || 0);

  const waves = [];
  let remaining = new Set(ids);
  while (remaining.size) {
    const wave = [...remaining].filter((id) => (indeg.get(id) || 0) === 0).sort();
    if (!wave.length) {
      // Cycle remnant — dump remaining as final wave
      waves.push([...remaining].sort());
      break;
    }
    waves.push(wave);
    for (const id of wave) {
      remaining.delete(id);
      for (const s of succs.get(id) || []) {
        indeg.set(s, Math.max(0, (indeg.get(s) || 0) - 1));
      }
    }
  }
  return waves;
}

function forwardPass(ids, durationById, preds, succs) {
  const es = new Map();
  const ef = new Map();
  const order = [];
  const indeg = new Map();
  for (const id of ids) indeg.set(id, preds.get(id)?.size || 0);
  const queue = [...ids].filter((id) => indeg.get(id) === 0).sort();
  const remaining = new Set(ids);

  while (queue.length) {
    const id = queue.shift();
    if (!remaining.has(id)) continue;
    remaining.delete(id);
    order.push(id);
    let start = 0;
    for (const p of preds.get(id) || []) {
      start = Math.max(start, ef.get(p) || 0);
    }
    const dur = durationById.get(id) || 0;
    es.set(id, start);
    ef.set(id, start + dur);
    for (const s of succs.get(id) || []) {
      indeg.set(s, (indeg.get(s) || 0) - 1);
      if (indeg.get(s) === 0) queue.push(s);
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
    const succList = [...(succs.get(id) || [])];
    let finish = projectEnd;
    if (succList.length) {
      finish = Math.min(...succList.map((s) => ls.get(s) ?? projectEnd));
    }
    const dur = durationById.get(id) || 0;
    lf.set(id, finish);
    ls.set(id, finish - dur);
  }
  return { ls, lf };
}

function pickCriticalPath(ids, succs, isCritical, es, ef) {
  const starts = [...ids].filter((id) => isCritical.get(id) && (es.get(id) || 0) === 0);
  let best = [];

  function dfs(id, path) {
    const nextPath = [...path, id];
    const critSuccs = [...(succs.get(id) || [])].filter((s) => isCritical.get(s));
    if (!critSuccs.length) {
      if (nextPath.length > best.length) best = nextPath;
      else if (nextPath.length === best.length) {
        const len = nextPath.reduce((s, x) => s + ((ef.get(x) || 0) - (es.get(x) || 0)), 0);
        const bestLen = best.reduce((s, x) => s + ((ef.get(x) || 0) - (es.get(x) || 0)), 0);
        if (len > bestLen) best = nextPath;
      }
      return;
    }
    for (const s of critSuccs.sort()) dfs(s, nextPath);
  }

  const seeds = starts.length ? starts : [...ids].filter((id) => isCritical.get(id));
  for (const s of seeds.sort()) dfs(s, []);
  return best;
}

/**
 * @returns {{ sequence, theoreticalCpm, criticalWorkIds, meta }}
 */
function runSequencingCpm(container, opts = {}) {
  const tasks = container?.planning?.tasks || [];
  const edges = container?.analyses?.dependency?.edges || [];
  const { ids, durationById, preds, succs, unresolvedEdgeCount } = buildTaskGraph(tasks, edges);

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
      meta: {
        source: 'engine',
        llmCalls: 0,
        unresolvedEdgeCount,
        nodeCount: 0,
      },
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
    const dur = durationById.get(id) || 0;
    sumEffortHours += dur;
    const totalFloat = (ls.get(id) || 0) - (es.get(id) || 0);
    const critical = Math.abs(totalFloat) <= FLOAT_EPSILON;
    isCritical.set(id, critical);
    nodes.push({
      workId: id,
      durationHours: dur,
      es: es.get(id) || 0,
      ef: ef.get(id) || 0,
      ls: ls.get(id) || 0,
      lf: lf.get(id) || 0,
      totalFloat: Math.round(totalFloat * 1000) / 1000,
      isCritical: critical,
    });
  }

  const criticalPath = pickCriticalPath(ids, succs, isCritical, es, ef);
  const criticalWorkIds = nodes.filter((n) => n.isCritical).map((n) => n.workId);

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
    meta: {
      source: 'engine',
      llmCalls: 0,
      unresolvedEdgeCount,
      nodeCount: ids.size,
      ...(opts.note ? { note: opts.note } : {}),
    },
    generatedAt: new Date().toISOString(),
  };
}

function applySequencingCpmToContainer(container, result) {
  const next = {
    ...container,
    planning: { ...container.planning },
  };
  next.planning.sequence = result.sequence || { waves: [] };
  next.planning.theoreticalCpm = result.theoreticalCpm || null;
  next.planning.criticalWorkIds = Array.isArray(result.criticalWorkIds)
    ? result.criticalWorkIds
    : [];
  return next;
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
