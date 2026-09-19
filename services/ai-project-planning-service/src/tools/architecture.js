const { createEvidence } = require('../evidence/evidence');

/** G11 Architecture — deterministic stub + evidence */
async function architecture(snapshot = {}, _context = {}) {
  const snapshotId = snapshot.snapshotId || snapshot.id || null;

  const evidence = [
    createEvidence({
      sourceType: 'architecture_catalog',
      sourceId: 'stub',
      snapshotId,
      metric: 'component_count',
      value: 0,
      unit: 'count',
      calculatedBy: 'ArchitectureTool',
      ruleId: 'ARCH-STUB-001',
    }),
  ];

  return {
    result: {
      components: [],
      dependencies: [],
      constraints: [],
      stub: true,
    },
    evidence,
  };
}

module.exports = { architecture };
