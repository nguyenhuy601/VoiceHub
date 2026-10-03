/**
 * UCEngine — source-first; heuristic FROM-FR with provenance.HEURISTIC.
 */

const {
  createEngineResult,
  noDataResult,
  failedResult,
  assertNoSrsDraftInEngineResult,
} = require('../contracts/analysisEngineContract');
const { normalizeProposalItem } = require('../contracts/proposalItem');
const { runSourceIngestEngine } = require('./engineHelpers');

function run(input = {}) {
  const meta = { engineId: 'uc', section: 'useCases', version: 1 };
  try {
    const sourced = runSourceIngestEngine({
      engineId: 'uc',
      section: 'useCases',
      packKeys: ['useCases'],
      prefix: 'UC',
      input,
      mapRow: (row, i) => ({
        logicalId: row.logicalId || row.id || `UC-${i + 1}`,
        title: row.title || row.name || `UC ${i + 1}`,
        primaryActor: row.primaryActor || null,
        relatedFrIds: row.relatedFrIds || [],
        sourceRefs: row.sourceRefs || [],
        origin: { type: 'EXTRACTED', engine: 'uc', section: 'useCases' },
        provenance: { type: 'EXTRACTED', derivedFrom: [], rule: null },
      }),
    });

    if (sourced.execution.status === 'SUCCESS' && sourced.items.length) {
      assertNoSrsDraftInEngineResult(sourced);
      return sourced;
    }

    const frItems =
      input.upstreamFragments?.functionalRequirements?.items ||
      input.context?.dependencyResults?.fr?.items ||
      [];

    if (!Array.isArray(frItems) || !frItems.length) {
      const gap = noDataResult(meta, sourced.coverage?.reason || 'SOURCE_UNAVAILABLE');
      assertNoSrsDraftInEngineResult(gap);
      return gap;
    }

    const items = frItems.slice(0, 50).map((fr, i) => {
      const frId = String(fr.logicalId || fr.id || `FR-${i + 1}`);
      return normalizeProposalItem(
        {
          logicalId: `UC-FROM-${frId}`,
          title: `UC: ${fr.title || frId}`,
          relatedFrIds: [frId],
          status: 'PROPOSED',
          sourceRefs: Array.isArray(fr.sourceRefs) ? [...fr.sourceRefs] : [],
          origin: { type: 'HEURISTIC', engine: 'uc', section: 'useCases' },
          provenance: { type: 'HEURISTIC', derivedFrom: [frId], rule: 'UC_FROM_FR' },
        },
        { index: i, engineId: 'uc', section: 'useCases', defaultPrefix: 'UC' }
      );
    });

    const result = createEngineResult({
      items,
      coverage: {
        status: 'PARTIAL',
        reason: 'HEURISTIC_FROM_FR',
        sourceStats: { sourceRows: 0, mappedRows: items.length, orphanRows: 0 },
      },
      validation: {
        errors: [],
        warnings: [{ code: 'HEURISTIC_UC', message: 'UC derived from FR (not Raw UC sheet)' }],
      },
      meta,
    });
    assertNoSrsDraftInEngineResult(result);
    return result;
  } catch (err) {
    return failedResult(meta, [{ message: err.message, code: err.code || 'ENGINE_ERROR' }]);
  }
}

module.exports = { id: 'uc', section: 'useCases', run };
