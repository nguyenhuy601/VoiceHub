/**
 * G4 relationship candidates — existence + circular checks.
 */

function normId(id) {
  return String(id || '').trim();
}

/**
 * @param {object[]} requirements
 * @returns {Set<string>}
 */
function buildRequirementIdSet(requirements = []) {
  const ids = new Set();
  for (const r of requirements || []) {
    const id = normId(r?.id || r?._id || r?.externalId);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Detect directed cycle among relationships (from → to).
 * @param {{ from: string, to: string }[]} relationships
 * @returns {string[][]} list of cycle id paths (empty if none)
 */
function findCycles(relationships = []) {
  const adj = new Map();
  for (const rel of relationships || []) {
    const from = normId(rel.from || rel.sourceId || rel.source);
    const to = normId(rel.to || rel.targetId || rel.target);
    if (!from || !to) continue;
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push(to);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  const stack = [];
  const cycles = [];

  function dfs(node) {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adj.get(node) || []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const idx = stack.indexOf(next);
        cycles.push(idx >= 0 ? stack.slice(idx).concat(next) : [node, next]);
        continue;
      }
      if (c === WHITE) dfs(next);
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const node of adj.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) dfs(node);
  }
  return cycles;
}

/**
 * Validate relationship candidates against requirement ids.
 * @param {{ requirements?: object[], relationships?: object[] }} input
 * @returns {{ ok: boolean, errors: object[], accepted: object[], rejected: object[] }}
 */
function validateRelationships(input = {}) {
  const requirements = Array.isArray(input.requirements) ? input.requirements : [];
  const relationships = Array.isArray(input.relationships) ? input.relationships : [];
  const idSet = buildRequirementIdSet(requirements);
  const errors = [];
  const accepted = [];
  const rejected = [];

  for (const rel of relationships) {
    const from = normId(rel.from || rel.sourceId || rel.source);
    const to = normId(rel.to || rel.targetId || rel.target);
    const evidence = Array.isArray(rel.evidence) ? rel.evidence : [];
    const type = String(rel.type || rel.kind || 'depends_on').trim() || 'depends_on';

    if (!from || !to) {
      const err = { code: 'REL_MISSING_ENDPOINT', from, to, type };
      errors.push(err);
      rejected.push({ ...rel, validationError: err.code });
      continue;
    }
    if (!idSet.has(from) || !idSet.has(to)) {
      const err = {
        code: 'REL_TARGET_MISSING',
        from,
        to,
        missingFrom: !idSet.has(from),
        missingTo: !idSet.has(to),
        type,
      };
      errors.push(err);
      rejected.push({ ...rel, validationError: err.code });
      continue;
    }
    if (evidence.length === 0) {
      const err = { code: 'REL_EVIDENCE_REQUIRED', from, to, type };
      errors.push(err);
      rejected.push({ ...rel, validationError: err.code });
      continue;
    }
    accepted.push({
      from,
      to,
      type,
      evidence,
      confidence: rel.confidence != null ? Number(rel.confidence) : null,
      note: rel.note || null,
    });
  }

  const cycles = findCycles(accepted);
  if (cycles.length) {
    for (const cycle of cycles) {
      errors.push({ code: 'REL_CIRCULAR', cycle });
    }
    // Reject edges that participate in any cycle
    const cycleNodes = new Set(cycles.flat());
    const kept = [];
    for (const rel of accepted) {
      if (cycleNodes.has(rel.from) && cycleNodes.has(rel.to)) {
        rejected.push({ ...rel, validationError: 'REL_CIRCULAR' });
      } else {
        kept.push(rel);
      }
    }
    return {
      ok: false,
      errors,
      accepted: kept,
      rejected,
      cycles,
    };
  }

  return {
    ok: errors.length === 0,
    errors,
    accepted,
    rejected,
    cycles: [],
  };
}

module.exports = {
  normId,
  buildRequirementIdSet,
  findCycles,
  validateRelationships,
};
