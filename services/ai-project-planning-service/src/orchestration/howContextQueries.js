/**
 * Pattern A context queries for HOW backlog / WBS retrieve.
 */

function buildHowBacklogRetrieveQuery(pack = {}) {
  const ov = pack.overview || {};
  const bits = [
    'agile backlog epic feature user story',
    ov.requirementName || ov.projectName || ov.name,
    ov.projectObjective || ov.businessScope,
    ov.businessGoals || ov.goalSummary,
  ];
  const frs = Array.isArray(pack.functionalRequirements)
    ? pack.functionalRequirements
    : Array.isArray(pack.frList)
      ? pack.frList
      : [];
  for (const fr of frs) {
    bits.push(fr?.externalId || fr?.id);
    bits.push(fr?.name || fr?.title);
    bits.push(fr?.description);
  }
  const bgs = Array.isArray(pack.businessGoals) ? pack.businessGoals : [];
  for (const bg of bgs) {
    bits.push(bg?.externalId || bg?.id);
    bits.push(bg?.name || bg?.title);
  }
  return bits
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 6000) || 'how_backlog';
}

function buildHowWbsRetrieveQuery(pack = {}, backlog = null) {
  const stories = Array.isArray(backlog?.stories) ? backlog.stories : [];
  const bits = ['wbs task decomposition deliverable implementation test'];
  for (const s of stories) {
    bits.push(s?.id);
    bits.push(s?.name || s?.title);
    bits.push(s?.description);
    if (Array.isArray(s?.sourceFrIds)) bits.push(...s.sourceFrIds);
    if (Array.isArray(s?.acRefs)) bits.push(...s.acRefs.slice(0, 8));
  }
  if (!stories.length) {
    return buildHowBacklogRetrieveQuery(pack);
  }
  return bits
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 6000);
}

module.exports = {
  buildHowBacklogRetrieveQuery,
  buildHowWbsRetrieveQuery,
};
