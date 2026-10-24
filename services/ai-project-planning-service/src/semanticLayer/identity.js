/**
 * Trusted identity is an explicit mapping for the same project and source.
 * Text or embedding hits stay candidates (RULE-SL-03).
 */

function resolveEntityIdentity({
  code,
  projectId,
  sourceId,
  mappings = [],
  textCandidates = [],
} = {}) {
  const trusted = mappings.find(
    (row) =>
      row.code === code && row.projectId === projectId && row.sourceId === sourceId
  );
  if (trusted) {
    return {
      status: 'MATCHED',
      entityId: trusted.entityId,
      trusted: true,
      candidates: [],
    };
  }
  return {
    status: 'CANDIDATES',
    entityId: null,
    trusted: false,
    candidates: textCandidates.map((row) => ({
      entityId: row.entityId,
      score: row.score,
    })),
  };
}

module.exports = {
  resolveEntityIdentity,
};
