const { createEvidence } = require('../evidence/evidence');

/** Requirement analysis — deterministic stub (extract counts from snapshot) */
async function requirementAnalysis(snapshot = {}, _context = {}) {
  const snapshotId = snapshot.snapshotId || snapshot.id || null;
  const frs = Array.isArray(snapshot.functionalRequirements)
    ? snapshot.functionalRequirements
    : Array.isArray(snapshot.frList)
      ? snapshot.frList
      : [];

  const evidence = [
    createEvidence({
      sourceType: 'srs_pack',
      sourceId: snapshot.packId || 'pack',
      snapshotId,
      metric: 'fr_count',
      value: frs.length,
      unit: 'count',
      calculatedBy: 'RequirementAnalysisTool',
      ruleId: 'REQ-STUB-001',
    }),
  ];

  return {
    result: {
      requirements: frs.map((fr, i) => ({
        id: fr.id || fr._id || `FR-${i + 1}`,
        title: fr.title || fr.name || null,
      })),
      relationships: [],
      ambiguities: [],
      assumptions: [],
      stub: true,
    },
    evidence,
  };
}

module.exports = { requirementAnalysis };
