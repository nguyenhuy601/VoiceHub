/**
 * Strip non-deterministic metadata for golden semantic parity (T-G4-01).
 */

const STRIP_META_KEYS = new Set([
  'runId',
  'timestamp',
  'duration',
  'durationMs',
  'traceId',
  'generationId',
  'completedAt',
  'startedAt',
  'createdAt',
  'updatedAt',
]);

function stripMetaObject(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (STRIP_META_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function sortById(arr, idKey = 'id') {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const ka = String(a?.[idKey] ?? a?.frId ?? a?.requirementId ?? JSON.stringify(a));
    const kb = String(b?.[idKey] ?? b?.frId ?? b?.requirementId ?? JSON.stringify(b));
    return ka.localeCompare(kb);
  });
}

/**
 * Canonical semantic view for parity: candidate identity, semantic fields,
 * relations, ambiguities, source refs, status-relevant fields.
 * @param {object} semantic
 * @returns {object}
 */
function normalizeSemanticOutput(semantic = {}) {
  const src = semantic && typeof semantic === 'object' ? semantic : {};
  const requirements = sortById(
    Array.isArray(src.requirements) ? src.requirements : [],
    'id'
  ).map((r) => {
    const {
      runId,
      timestamp,
      duration,
      durationMs,
      traceId,
      generationId,
      ...rest
    } = r || {};
    return rest;
  });

  const relationships = sortById(
    Array.isArray(src.relationships) ? src.relationships : [],
    'from'
  ).map((rel) => {
    const { runId, timestamp, duration, durationMs, traceId, generationId, ...rest } =
      rel || {};
    return rest;
  });

  const ambiguities = sortById(
    Array.isArray(src.ambiguities) ? src.ambiguities : [],
    'requirementId'
  );

  const semanticItems = sortById(
    Array.isArray(src.semanticItems) ? src.semanticItems : [],
    'frId'
  ).map((item) => {
    const { runId, timestamp, duration, durationMs, traceId, generationId, ...rest } =
      item || {};
    return rest;
  });

  const evidence = src.evidence && typeof src.evidence === 'object' ? src.evidence : {};
  const evidenceItems = sortById(
    Array.isArray(evidence.items) ? evidence.items : Array.isArray(evidence) ? evidence : [],
    'id'
  );

  return {
    requirements,
    relationships,
    ambiguities,
    assumptions: Array.isArray(src.assumptions) ? [...src.assumptions].sort() : [],
    semanticItems,
    conflicts: sortById(Array.isArray(src.conflicts) ? src.conflicts : [], 'id'),
    evidence: Array.isArray(evidence)
      ? evidenceItems
      : { ...evidence, items: evidenceItems },
    signalsMeta: src.signalsMeta || null,
    facts: src.facts && typeof src.facts === 'object' ? src.facts : {},
    meta: stripMetaObject(src.meta || {}),
    // synthesis intentionally excluded from FR semantic parity (T-G4-04)
  };
}

module.exports = {
  normalizeSemanticOutput,
  STRIP_META_KEYS,
};
