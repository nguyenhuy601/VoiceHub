/**
 * BPMEngine — source-ingest only.
 * RULE-NO-BPM-FROM-FR-01: must NOT synthesize processes from FR/UC lists.
 * relatedFrIds from Raw are source_declared relations only.
 */

const { runSourceIngestEngine } = require('./engineHelpers');

function run(input = {}) {
  // Explicitly ignore FR/UC upstream for synthesis
  const safeInput = {
    ...input,
    upstreamFragments: undefined,
  };

  return runSourceIngestEngine({
    engineId: 'bpm',
    section: 'processes',
    packKeys: ['businessProcesses', 'processes'],
    prefix: 'PROC',
    input: safeInput,
    mapRow: (row, i) => {
      const relatedFrIds = Array.isArray(row.relatedFrIds)
        ? row.relatedFrIds.map(String)
        : row.relatedFr
          ? [String(row.relatedFr)]
          : [];
      return {
        logicalId: row.logicalId || row.id || `PROC-${i + 1}`,
        title: row.title || row.name || row.processName || `Process ${i + 1}`,
        steps: Array.isArray(row.steps) ? row.steps : [],
        relatedFrIds,
        relationProvenance: relatedFrIds.length ? 'source_declared' : null,
        sourceRefs: row.sourceRefs || [],
      };
    },
  });
}

module.exports = { id: 'bpm', section: 'processes', run };
