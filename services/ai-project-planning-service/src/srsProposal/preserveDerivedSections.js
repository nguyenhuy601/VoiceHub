/**
 * When Derive runs before Engines, do not let sheet/heuristic ingest wipe candidates.
 */

function sectionItemCount(proposal, section) {
  const items = proposal?.generated?.[section]?.items;
  return Array.isArray(items) ? items.length : 0;
}

function itemOriginType(item) {
  return String(item?.origin?.type || item?.provenance?.type || '').toUpperCase();
}

function sectionHasDerivedCandidates(proposal, section) {
  const items = proposal?.generated?.[section]?.items;
  if (!Array.isArray(items) || !items.length) return false;
  return items.some((it) => itemOriginType(it) === 'DERIVED');
}

/**
 * @returns {boolean} true if engine write should apply
 */
function shouldApplyEngineSectionWrite(proposal, section, incomingItems) {
  if (!section) return false;
  // Never overwrite LLM/deterministic derive candidates
  if (sectionHasDerivedCandidates(proposal, section)) return false;
  const incoming = Array.isArray(incomingItems) ? incomingItems : [];
  const existing = sectionItemCount(proposal, section);
  // Preserve any non-empty section when engine returns empty
  if (existing > 0 && incoming.length === 0) return false;
  return true;
}

module.exports = {
  sectionItemCount,
  sectionHasDerivedCandidates,
  shouldApplyEngineSectionWrite,
};
