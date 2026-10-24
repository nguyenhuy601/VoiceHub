/**
 * Per-task timing facts from WBS leaves + dependency order + CPM.
 * Hours and order come from the sequencing tool. This module does not invent dates.
 */

function taskIdOf(task) {
  return String(task?.id || task?.taskId || '').trim();
}

function roundHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0) return 0;
  return Math.round(hours * 10) / 10;
}

function isWbsLeaf(task) {
  const level = String(task?.level || '').toLowerCase();
  return level === 'task' || level === 'subtask';
}

/**
 * Schema-v2 dependencies win. Legacy edges store the successor on `from`
 * and the predecessor on `to` (same convention as SequencingTool).
 */
function predecessorIds(taskId, dependencies, edges) {
  const preds = new Set();
  const deps = Array.isArray(dependencies) ? dependencies : [];
  if (deps.length) {
    for (const dep of deps) {
      const succ = String(dep?.successorTaskId || '').trim();
      const pred = String(dep?.predecessorTaskId || '').trim();
      if (succ === taskId && pred && pred !== taskId) preds.add(pred);
    }
    return [...preds];
  }
  for (const edge of Array.isArray(edges) ? edges : []) {
    const succ = String(edge?.from || '').trim();
    const pred = String(edge?.to || '').trim();
    if (succ === taskId && pred && pred !== taskId) preds.add(pred);
  }
  return [...preds];
}

function successorIds(taskId, dependencies, edges) {
  const succs = new Set();
  const deps = Array.isArray(dependencies) ? dependencies : [];
  if (deps.length) {
    for (const dep of deps) {
      const pred = String(dep?.predecessorTaskId || '').trim();
      const succ = String(dep?.successorTaskId || '').trim();
      if (pred === taskId && succ && succ !== taskId) succs.add(succ);
    }
    return [...succs];
  }
  for (const edge of Array.isArray(edges) ? edges : []) {
    const pred = String(edge?.to || '').trim();
    const succ = String(edge?.from || '').trim();
    if (pred === taskId && succ && succ !== taskId) succs.add(succ);
  }
  return [...succs];
}

function cpmById(theoreticalCpm) {
  const map = new Map();
  const nodes = Array.isArray(theoreticalCpm?.nodes) ? theoreticalCpm.nodes : [];
  const tasks = Array.isArray(theoreticalCpm?.tasks) ? theoreticalCpm.tasks : [];
  for (const node of nodes) {
    const id = String(node?.workId || node?.id || '').trim();
    if (!id) continue;
    map.set(id, node);
  }
  for (const row of tasks) {
    const id = String(row?.id || row?.workId || '').trim();
    if (!id || map.has(id)) continue;
    map.set(id, row);
  }
  return map;
}

function waveIndexById(waves) {
  const map = new Map();
  (Array.isArray(waves) ? waves : []).forEach((wave, index) => {
    for (const id of wave || []) {
      const key = String(id || '').trim();
      if (key && !map.has(key)) map.set(key, index + 1);
    }
  });
  return map;
}

function brief(taskById, id) {
  const task = taskById.get(id);
  return {
    id,
    title: String(task?.name || task?.title || id).trim(),
  };
}

/**
 * @param {object} container
 * @returns {Array<object>}
 */
function buildTaskTimingFacts(container = {}) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const leaves = tasks.filter((task) => taskIdOf(task) && isWbsLeaf(task));
  const taskById = new Map(tasks.map((task) => [taskIdOf(task), task]).filter(([id]) => id));
  const analysis = container?.analyses?.dependency || {};
  const dependencies = Array.isArray(analysis.dependencies) ? analysis.dependencies : [];
  const edges = Array.isArray(analysis.edges) ? analysis.edges : [];
  const cpm = cpmById(container?.planning?.theoreticalCpm);
  const waves = waveIndexById(container?.planning?.sequence?.waves);
  const waveMembers = new Map();
  for (const leaf of leaves) {
    const id = taskIdOf(leaf);
    const wave = waves.get(id) || 1;
    if (!waveMembers.has(wave)) waveMembers.set(wave, []);
    waveMembers.get(wave).push(id);
  }

  return leaves.map((leaf) => {
    const id = taskIdOf(leaf);
    const node = cpm.get(id) || {};
    const durationHours = roundHours(
      node.durationHours != null ? node.durationHours : leaf.effortHours
    );
    const esHours = roundHours(node.es);
    const efHours = roundHours(node.ef != null ? node.ef : esHours + durationHours);
    const totalFloatHours = roundHours(node.totalFloat);
    const critical = Boolean(node.isCritical ?? node.critical);
    const wave = waves.get(id) || 1;
    const preds = predecessorIds(id, dependencies, edges).filter((pred) => taskById.has(pred));
    const succs = successorIds(id, dependencies, edges).filter((succ) => taskById.has(succ));
    const parallelIds = (waveMembers.get(wave) || []).filter((other) => other !== id);
    return {
      id,
      title: String(leaf.name || leaf.title || id).trim(),
      durationHours,
      esHours,
      efHours,
      totalFloatHours,
      critical,
      wave,
      predecessors: preds.map((pred) => brief(taskById, pred)),
      successors: succs.map((succ) => brief(taskById, succ)),
      parallelWith: parallelIds.map((other) => brief(taskById, other)),
    };
  });
}

module.exports = {
  buildTaskTimingFacts,
  predecessorIds,
};
