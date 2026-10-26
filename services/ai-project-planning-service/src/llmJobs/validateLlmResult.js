/**
 * Validate job.result: JSON object + allowedSources ⊆ refs when present.
 */

function validateLlmResult(result, opts = {}) {
  if (result == null || typeof result !== 'object' || Array.isArray(result)) {
    return { ok: false, code: 'RESULT_NOT_OBJECT' };
  }
  const allowed = Array.isArray(opts.allowedSources) ? opts.allowedSources.map(String) : null;
  if (allowed && allowed.length) {
    const used = collectSourceIds(result);
    for (const id of used) {
      if (!allowed.includes(id)) {
        return { ok: false, code: 'SOURCE_NOT_ALLOWED', id };
      }
    }
  }
  return { ok: true };
}

function collectSourceIds(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const row of node) collectSourceIds(row, out);
    return out;
  }
  if (node.sourceId != null) out.add(String(node.sourceId));
  if (Array.isArray(node.sources)) {
    for (const s of node.sources) {
      if (typeof s === 'string') out.add(s);
      else if (s?.id != null) out.add(String(s.id));
    }
  }
  if (Array.isArray(node.allowedSources)) {
    for (const s of node.allowedSources) out.add(String(s));
  }
  for (const key of Object.keys(node)) {
    if (key === 'sources' || key === 'allowedSources') continue;
    collectSourceIds(node[key], out);
  }
  return out;
}

module.exports = {
  validateLlmResult,
  collectSourceIds,
};
