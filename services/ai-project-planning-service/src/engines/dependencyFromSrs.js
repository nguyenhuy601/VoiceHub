/**
 * Build Finish-to-Start edges from FR order / same UC / sourceFrIds (NOTE-2.1d).
 */

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function listFrRows(pack = {}) {
  if (Array.isArray(pack.functionalRequirements)) return pack.functionalRequirements;
  if (Array.isArray(pack.frList)) return pack.frList;
  if (Array.isArray(pack.requirements)) return pack.requirements;
  return [];
}

function frId(row, index = 0) {
  return String(row?.externalId || row?.id || row?._id || `FR-${index + 1}`).trim();
}

function isLeafTask(task) {
  const level = String(task?.level || '').toLowerCase();
  if (level === 'epic' || level === 'feature' || level === 'story') return false;
  return level === 'task' || !level;
}

function leafTasks(tasks = []) {
  return (tasks || []).filter((t) => t?.id && isLeafTask(t));
}

/**
 * @param {{ tasks: object[], pack?: object, planningHints?: object }} args
 * @returns {object[]} edges
 */
function buildDependencyEdgesFromSrs({ tasks = [], pack = {}, planningHints = null } = {}) {
  const leaves = leafTasks(tasks);
  if (!leaves.length) return [];

  const known = new Set(leaves.map((t) => String(t.id)));
  const edges = [];
  const edgeKey = new Set();
  let idx = 0;

  const pushEdge = (from, to, evidence) => {
    const f = String(from || '').trim();
    const t = String(to || '').trim();
    if (!f || !t || f === t) return;
    if (!known.has(f) || !known.has(t)) return;
    const key = `${f}->${t}`;
    if (edgeKey.has(key)) return;
    edgeKey.add(key);
    idx += 1;
    edges.push({
      edgeId: `DEP-SRS-${slugPart(f)}-${slugPart(t)}-${idx}`,
      from: f,
      to: t,
      kind: 'precedes',
      type: 'fs',
      critical: false,
      blocking: true,
      evidence,
      source: 'srs',
    });
  };

  // FR document order: later FR leaf depends on earlier FR leaf (to before from)
  const frOrder = (planningHints?.frIds || []).length
    ? planningHints.frIds.map(String)
    : listFrRows(pack).map((row, i) => frId(row, i));

  const leavesByFr = new Map();
  for (const task of leaves) {
    for (const fid of task.sourceFrIds || []) {
      const key = String(fid);
      if (!leavesByFr.has(key)) leavesByFr.set(key, []);
      leavesByFr.get(key).push(task);
    }
  }

  for (let i = 1; i < frOrder.length; i += 1) {
    const prevFr = String(frOrder[i - 1]);
    const curFr = String(frOrder[i]);
    const prevLeaves = leavesByFr.get(prevFr) || [];
    const curLeaves = leavesByFr.get(curFr) || [];
    if (!prevLeaves.length || !curLeaves.length) continue;
    // Last leaf of prev FR precedes first leaf of current FR
    const prevSorted = [...prevLeaves].sort(
      (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
    );
    const curSorted = [...curLeaves].sort(
      (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
    );
    pushEdge(curSorted[0].id, prevSorted[prevSorted.length - 1].id, 'fr_document_order');
  }

  // Within same FR: AC index order
  for (const [, list] of leavesByFr) {
    const sorted = [...list].sort((a, b) => {
      const ai = Array.isArray(a.sourceAcIndexes) ? Number(a.sourceAcIndexes[0]) || 0 : 0;
      const bi = Array.isArray(b.sourceAcIndexes) ? Number(b.sourceAcIndexes[0]) || 0 : 0;
      return ai - bi || (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
    });
    for (let i = 1; i < sorted.length; i += 1) {
      pushEdge(sorted[i].id, sorted[i - 1].id, 'ac_order_same_fr');
    }
  }

  // Same UC: earlier FR in UC precedes later (via sourceUcIds overlap)
  const byUc = new Map();
  for (const task of leaves) {
    for (const uc of task.sourceUcIds || []) {
      const key = String(uc);
      if (!byUc.has(key)) byUc.set(key, []);
      byUc.get(key).push(task);
    }
  }
  for (const [, list] of byUc) {
    const sorted = [...list].sort((a, b) => {
      const aFr = String((a.sourceFrIds || [])[0] || '');
      const bFr = String((b.sourceFrIds || [])[0] || '');
      const ai = frOrder.indexOf(aFr);
      const bi = frOrder.indexOf(bFr);
      if (ai !== -1 && bi !== -1 && ai !== bi) return ai - bi;
      return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
    });
    for (let i = 1; i < sorted.length; i += 1) {
      pushEdge(sorted[i].id, sorted[i - 1].id, 'same_uc_precedes');
    }
  }

  return edges;
}

module.exports = {
  buildDependencyEdgesFromSrs,
  leafTasks,
  isLeafTask,
};
