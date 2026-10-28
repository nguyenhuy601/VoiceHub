/**
 * Dependency Facts — evidence field catalog derived from SEMANTIC only.
 * No candidate engine / SRS order / same-area invent.
 */

const TASK_EVIDENCE_FIELDS = Object.freeze(['title', 'description', 'deliverable', 'dependsOn']);
const FR_EVIDENCE_FIELDS = Object.freeze(['title', 'statement']);

function depTypeOf(value) {
  const token = String(value || '').trim().toUpperCase();
  if (token === 'FS' || token === 'SS' || token === 'FF' || token === 'SF') return token;
  return null;
}

function pushEvidence(store, byId, row) {
  const id = String(row.id || '').trim();
  if (!id || byId.has(id)) return;
  const entry = {
    id,
    kind: row.kind || 'field',
    taskId: row.taskId ? String(row.taskId).trim() : null,
    frId: row.frId ? String(row.frId).trim() : null,
    field: String(row.field || '').trim(),
    text: row.text != null ? String(row.text).slice(0, 280) : '',
  };
  byId.set(id, entry);
  store.push(entry);
}

/**
 * Build field evidence from semantic taskBrief + frBrief.
 * @param {{ semantic?: object, allowLists?: object }} args
 */
function buildDependencyFacts({ semantic = null, allowLists = {} } = {}) {
  const taskBrief = Array.isArray(semantic?.upstream?.taskBrief)
    ? semantic.upstream.taskBrief
    : [];
  const frBrief = Array.isArray(semantic?.business?.frBrief) ? semantic.business.frBrief : [];
  const taskIds = (allowLists.taskIds || taskBrief.map((t) => t.id)).map(String);
  const frIds = (allowLists.frIds || frBrief.map((f) => f.id)).map(String);
  const knownTasks = new Set(taskIds);
  const knownFrs = new Set(frIds);

  const evidence = [];
  const byId = new Map();

  for (const task of taskBrief) {
    const taskId = String(task?.id || '').trim();
    if (!taskId || !knownTasks.has(taskId)) continue;
    for (const field of TASK_EVIDENCE_FIELDS) {
      const raw = task[field];
      if (raw == null) continue;
      if (Array.isArray(raw) && !raw.length) continue;
      if (typeof raw === 'string' && !raw.trim()) continue;
      const text = Array.isArray(raw) ? raw.map(String).join(', ') : String(raw);
      pushEvidence(evidence, byId, {
        id: `${taskId}:${field}`,
        kind: 'task_field',
        taskId,
        field,
        text,
      });
    }
  }

  for (const fr of frBrief) {
    const frId = String(fr?.id || '').trim();
    if (!frId || !knownFrs.has(frId)) continue;
    for (const field of FR_EVIDENCE_FIELDS) {
      const raw = fr[field];
      if (typeof raw !== 'string' || !raw.trim()) continue;
      pushEvidence(evidence, byId, {
        id: `${frId}:${field}`,
        kind: 'fr_field',
        frId,
        field,
        text: raw,
      });
    }
  }

  const evidenceIds = evidence.map((e) => e.id);
  return {
    evidence,
    evidenceById: byId,
    allowLists: {
      taskIds: [...knownTasks],
      frIds: [...knownFrs],
      evidenceIds,
      depTypes: ['FS', 'SS', 'FF', 'SF'],
    },
    taskBrief,
    frBrief,
    meta: {
      evidenceCount: evidence.length,
      inventForbidden: true,
      noCandidateEngine: true,
      noSrsOrder: true,
    },
  };
}

/**
 * Stable catalog for Accept — field evidence only (no DEP-CAND / DEP-SRS invent).
 */
function buildDependencyEvidenceCatalog(facts = {}) {
  const byId = new Map();
  const evidence = [];
  if (facts.evidenceById instanceof Map) {
    for (const [id, entry] of facts.evidenceById) {
      byId.set(id, entry);
      evidence.push(entry);
    }
  } else {
    for (const row of facts.evidence || []) {
      const id = String(row?.id || '').trim();
      if (!id || byId.has(id)) continue;
      byId.set(id, row);
      evidence.push(row);
    }
  }
  return {
    byId,
    evidence,
    // legacy empty aliases so old callers don't crash
    candidates: [],
    srsEdges: [],
  };
}

module.exports = {
  buildDependencyFacts,
  buildDependencyEvidenceCatalog,
  depTypeOf,
  TASK_EVIDENCE_FIELDS,
  FR_EVIDENCE_FIELDS,
};
