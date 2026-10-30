/**
 * Post-generate output validation (Wave 2) — material claims need sourceRefs.
 */

/**
 * @param {{
 *   output?: object,
 *   allowedSourceIds?: string[]|Set<string>,
 *   requiredSourceIds?: string[]|Set<string>,
 * }} args
 */
function postGenerateOutputCheck(args = {}) {
  const output = args.output && typeof args.output === 'object' ? args.output : {};
  const allowed = new Set(
    args.allowedSourceIds instanceof Set
      ? args.allowedSourceIds
      : Array.isArray(args.allowedSourceIds)
        ? args.allowedSourceIds
        : []
  );
  const required = new Set(
    args.requiredSourceIds instanceof Set
      ? args.requiredSourceIds
      : Array.isArray(args.requiredSourceIds)
        ? args.requiredSourceIds
        : []
  );

  const items = Array.isArray(output.items)
    ? output.items
    : Array.isArray(output.requirements)
      ? output.requirements
      : Array.isArray(output)
        ? output
        : [];

  const unsupportedClaims = [];
  const missingRequiredCoverage = [];
  const cited = new Set();

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || typeof item !== 'object') continue;
    const refs = Array.isArray(item.sourceRefs)
      ? item.sourceRefs
      : Array.isArray(item.citations)
        ? item.citations
        : [];
    const refIds = refs
      .map((r) => String(r?.id || r?.sourceId || r || '').trim())
      .filter(Boolean);
    if (!refIds.length) {
      const claim = String(item.name || item.title || item.id || `item[${i}]`).trim();
      unsupportedClaims.push(claim);
      continue;
    }
    for (const id of refIds) {
      cited.add(id);
      if (allowed.size && !allowed.has(id)) {
        unsupportedClaims.push(`${item.id || i}:unknown_ref:${id}`);
      }
    }
  }

  for (const rid of required) {
    if (!cited.has(rid)) missingRequiredCoverage.push(rid);
  }

  const ok = unsupportedClaims.length === 0;
  return {
    ok,
    unsupportedClaims,
    missingRequiredCoverage,
    citedSourceIds: [...cited],
    needsRetrieveMore: !ok || missingRequiredCoverage.length > 0,
    status: ok
      ? missingRequiredCoverage.length
        ? 'incomplete_coverage'
        : 'ok'
      : 'unsupported_claims',
  };
}

module.exports = {
  postGenerateOutputCheck,
};
