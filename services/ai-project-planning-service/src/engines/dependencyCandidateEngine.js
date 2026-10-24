/**
 * Deterministic dependency_candidate tool — produces candidates with evidenceRefs.
 * Does NOT decide parallel vs blocking; LLM synthesizer does that from context.
 */

const { isLeafTask, leafTasks } = require('./dependencyFromSrs');

const CANDIDATE_RULES = Object.freeze({
  CONSUMES_PRODUCER_OUTPUT: 'CONSUMES_PRODUCER_OUTPUT',
  EXPLICIT_DEPENDS_ON: 'EXPLICIT_DEPENDS_ON',
  SRS_FR_ORDER: 'SRS_FR_ORDER',
  SRS_AC_ORDER: 'SRS_AC_ORDER',
  SRS_SAME_UC: 'SRS_SAME_UC',
  SAME_AREA_ORDER: 'SAME_AREA_ORDER',
});

function taskIdOf(task, index = 0) {
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

function listFrRows(pack = {}) {
  if (Array.isArray(pack.functionalRequirements)) return pack.functionalRequirements;
  if (Array.isArray(pack.frList)) return pack.frList;
  if (Array.isArray(pack.requirements)) return pack.requirements;
  return [];
}

function frId(row, index = 0) {
  return String(row?.externalId || row?.id || row?._id || `FR-${index + 1}`).trim();
}

function normalizeTokenText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Significant tokens from deliverable/description for CONSUMES_PRODUCER_OUTPUT match. */
function significantTokens(text) {
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'task',
    'build',
    'create',
    'implement',
    'xây',
    'dựng',
    'tạo',
    'và',
    'của',
    'cho',
    'một',
    'các',
    'được',
    'api',
    'ui',
    'fe',
    'be',
  ]);
  return normalizeTokenText(text)
    .split(' ')
    .filter((t) => t.length >= 4 && !stop.has(t))
    .slice(0, 12);
}

function candidateKey(pred, succ) {
  return `${pred}->${succ}`;
}

function pushCandidate(store, keys, row) {
  const predecessorTaskId = String(row.predecessorTaskId || '').trim();
  const successorTaskId = String(row.successorTaskId || '').trim();
  if (!predecessorTaskId || !successorTaskId || predecessorTaskId === successorTaskId) {
    return;
  }
  const key = candidateKey(predecessorTaskId, successorTaskId);
  if (keys.has(key)) return;
  keys.add(key);
  store.push({
    predecessorTaskId,
    successorTaskId,
    candidateRule: row.candidateRule,
    evidenceRefs: Array.isArray(row.evidenceRefs) ? row.evidenceRefs.slice(0, 8) : [],
    strength: row.strength || 'weak',
  });
}

/**
 * Match consumer description/acRefs against producer deliverable tokens.
 * predecessor = producer (provides output), successor = consumer.
 */
function buildConsumesProducerCandidates(leaves = []) {
  const out = [];
  const keys = new Set();
  for (let i = 0; i < leaves.length; i += 1) {
    const producer = leaves[i];
    const prodId = taskIdOf(producer, i);
    const deliverable = producer.deliverable || producer.output || '';
    const tokens = significantTokens(deliverable);
    if (tokens.length < 1) continue;

    for (let j = 0; j < leaves.length; j += 1) {
      if (i === j) continue;
      const consumer = leaves[j];
      const consId = taskIdOf(consumer, j);
      const hay = normalizeTokenText(
        [
          consumer.description,
          consumer.name,
          consumer.title,
          ...(consumer.acRefs || []),
          consumer.deliverable,
        ]
          .filter(Boolean)
          .join(' ')
      );
      if (!hay) continue;
      const hits = tokens.filter((tok) => hay.includes(tok));
      // Need ≥2 token hits OR one strong artifact token (≥6 chars) + area cross (fe consumes be)
      const strongHit = hits.some((h) => h.length >= 6);
      const crossArea =
        String(producer.area || '').toLowerCase() !== String(consumer.area || '').toLowerCase() &&
        hits.length >= 1;
      if (hits.length >= 2 || (strongHit && hits.length >= 1) || (crossArea && strongHit)) {
        pushCandidate(out, keys, {
          predecessorTaskId: prodId,
          successorTaskId: consId,
          candidateRule: CANDIDATE_RULES.CONSUMES_PRODUCER_OUTPUT,
          evidenceRefs: [
            `${consId}:description`,
            `${prodId}:deliverable`,
          ],
          strength: hits.length >= 2 || strongHit ? 'strong' : 'weak',
        });
      }
    }
  }
  return out;
}

function buildExplicitCandidates(leaves = []) {
  const out = [];
  const keys = new Set();
  const known = new Set(leaves.map((t, i) => taskIdOf(t, i)));
  for (let i = 0; i < leaves.length; i += 1) {
    const task = leaves[i];
    const succ = taskIdOf(task, i);
    for (const pred of parseDependsOn(task)) {
      if (!known.has(pred)) continue;
      pushCandidate(out, keys, {
        predecessorTaskId: pred,
        successorTaskId: succ,
        candidateRule: CANDIDATE_RULES.EXPLICIT_DEPENDS_ON,
        evidenceRefs: [`${succ}:dependsOn`],
        strength: 'strong',
      });
    }
  }
  return out;
}

function buildSrsOrderCandidates(leaves = [], pack = {}, planningHints = null) {
  const out = [];
  const keys = new Set();
  const known = new Set(leaves.map((t) => String(t.id)));

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
    const prevSorted = [...prevLeaves].sort(
      (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
    );
    const curSorted = [...curLeaves].sort(
      (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
    );
    const pred = String(prevSorted[prevSorted.length - 1].id);
    const succ = String(curSorted[0].id);
    if (!known.has(pred) || !known.has(succ)) continue;
    pushCandidate(out, keys, {
      predecessorTaskId: pred,
      successorTaskId: succ,
      candidateRule: CANDIDATE_RULES.SRS_FR_ORDER,
      evidenceRefs: [`${succ}:sourceFrIds`, `${pred}:sourceFrIds`],
      strength: 'weak',
    });
  }

  for (const [, list] of leavesByFr) {
    const sorted = [...list].sort((a, b) => {
      const ai = Array.isArray(a.sourceAcIndexes) ? Number(a.sourceAcIndexes[0]) || 0 : 0;
      const bi = Array.isArray(b.sourceAcIndexes) ? Number(b.sourceAcIndexes[0]) || 0 : 0;
      return ai - bi || (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
    });
    for (let i = 1; i < sorted.length; i += 1) {
      pushCandidate(out, keys, {
        predecessorTaskId: String(sorted[i - 1].id),
        successorTaskId: String(sorted[i].id),
        candidateRule: CANDIDATE_RULES.SRS_AC_ORDER,
        evidenceRefs: [`${sorted[i].id}:sourceAcIndexes`],
        strength: 'weak',
      });
    }
  }

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
      pushCandidate(out, keys, {
        predecessorTaskId: String(sorted[i - 1].id),
        successorTaskId: String(sorted[i].id),
        candidateRule: CANDIDATE_RULES.SRS_SAME_UC,
        evidenceRefs: [`${sorted[i].id}:sourceUcIds`],
        strength: 'weak',
      });
    }
  }

  return out;
}

/** Demoted: weak same-area order — never auto-blocking. */
function buildSameAreaCandidates(leaves = []) {
  const out = [];
  const keys = new Set();
  const byArea = new Map();
  for (let i = 0; i < leaves.length; i += 1) {
    const task = leaves[i];
    if (!isLeafTask(task)) continue;
    const id = taskIdOf(task, i);
    const area = String(task.area || 'general').toLowerCase();
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push({ id, sortOrder: Number(task.sortOrder) || i });
  }
  for (const [, list] of byArea) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 1; i < list.length; i += 1) {
      pushCandidate(out, keys, {
        predecessorTaskId: list[i - 1].id,
        successorTaskId: list[i].id,
        candidateRule: CANDIDATE_RULES.SAME_AREA_ORDER,
        evidenceRefs: [`${list[i].id}:area`],
        strength: 'weak',
      });
    }
  }
  return out;
}

/**
 * Tasks that mention API/integration but have no matching producer deliverable hit.
 */
function findUnresolvedTaskIds(leaves = [], candidates = []) {
  const covered = new Set(
    candidates
      .filter((c) => c.candidateRule === CANDIDATE_RULES.CONSUMES_PRODUCER_OUTPUT)
      .map((c) => c.successorTaskId)
  );
  const unresolved = [];
  for (let i = 0; i < leaves.length; i += 1) {
    const t = leaves[i];
    const id = taskIdOf(t, i);
    if (covered.has(id)) continue;
    const hay = normalizeTokenText(
      [t.description, t.name, t.title, ...(t.acRefs || []), t.deliverable].filter(Boolean).join(' ')
    );
    if (/\b(api|endpoint|integrat|tích hợp|contract)\b/i.test(hay) && !hay.includes('mock')) {
      unresolved.push(id);
    }
  }
  return unresolved.slice(0, 24);
}

/**
 * Tool-shaped result:
 * { tool, status, data: { candidates, unresolvedTaskIds } }
 */
function runDependencyCandidateTool({
  container = {},
  pack = {},
  planningHints = null,
} = {}) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const leaves = leafTasks(tasks);
  const keys = new Set();
  const candidates = [];

  const merge = (rows) => {
    for (const row of rows) {
      pushCandidate(candidates, keys, row);
    }
  };

  // Priority: strong evidence first, then SRS weak, then same-area demoted
  merge(buildExplicitCandidates(leaves));
  merge(buildConsumesProducerCandidates(leaves));
  merge(buildSrsOrderCandidates(leaves, pack, planningHints));
  merge(buildSameAreaCandidates(leaves));

  const unresolvedTaskIds = findUnresolvedTaskIds(leaves, candidates);

  return {
    tool: 'dependency_candidate',
    status: 'success',
    data: {
      candidates,
      unresolvedTaskIds,
    },
    meta: {
      leafCount: leaves.length,
      candidateCount: candidates.length,
      byRule: Object.values(CANDIDATE_RULES).reduce((acc, rule) => {
        acc[rule] = candidates.filter((c) => c.candidateRule === rule).length;
        return acc;
      }, {}),
    },
  };
}

module.exports = {
  CANDIDATE_RULES,
  runDependencyCandidateTool,
  buildConsumesProducerCandidates,
  buildExplicitCandidates,
  buildSameAreaCandidates,
  buildSrsOrderCandidates,
  findUnresolvedTaskIds,
  significantTokens,
};
