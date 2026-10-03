/**
 * DataEngine — source-first entities; optional FR noun hints with HEURISTIC provenance.
 * Must not modify FR.
 */

const {
  createEngineResult,
  noDataResult,
  failedResult,
  assertNoSrsDraftInEngineResult,
} = require('../contracts/analysisEngineContract');
const { normalizeProposalItem } = require('../contracts/proposalItem');
const { runSourceIngestEngine } = require('./engineHelpers');

function nounHintsFromFr(frItems) {
  const hints = [];
  const seen = new Set();
  for (const fr of frItems || []) {
    const text = `${fr.title || ''} ${fr.description || ''}`;
    const words = text.match(/\b[A-Z][a-zA-Z]{2,}\b/g) || [];
    for (const w of words.slice(0, 3)) {
      const key = w.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hints.push({
        name: w,
        derivedFrom: [String(fr.logicalId || fr.id)],
        sourceRefs: Array.isArray(fr.sourceRefs) ? [...fr.sourceRefs] : [],
      });
    }
  }
  return hints.slice(0, 30);
}

function run(input = {}) {
  const meta = { engineId: 'data', section: 'entities', version: 1 };
  try {
    const sourced = runSourceIngestEngine({
      engineId: 'data',
      section: 'entities',
      packKeys: ['entities', 'domainEntities'],
      prefix: 'ENT',
      input,
      mapRow: (row, i) => ({
        logicalId: row.logicalId || row.id || `ENT-${i + 1}`,
        name: row.name || row.title || `Entity ${i + 1}`,
        title: row.title || row.name || `Entity ${i + 1}`,
        attributes: Array.isArray(row.attributes) ? row.attributes : [],
        sourceRefs: row.sourceRefs || [],
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
    const hints = nounHintsFromFr(frItems);
    if (!hints.length) {
      const gap = noDataResult(meta, sourced.coverage?.reason || 'SOURCE_UNAVAILABLE');
      assertNoSrsDraftInEngineResult(gap);
      return gap;
    }

    const items = hints.map((h, i) =>
      normalizeProposalItem(
        {
          logicalId: `ENT-HINT-${i + 1}`,
          name: h.name,
          title: h.name,
          attributes: [],
          status: 'PROPOSED',
          sourceRefs: h.sourceRefs,
          origin: { type: 'HEURISTIC', engine: 'data', section: 'entities' },
          provenance: {
            type: 'HEURISTIC',
            derivedFrom: h.derivedFrom,
            rule: 'DATA_NOUN_HINT_FROM_FR',
          },
        },
        { index: i, engineId: 'data', section: 'entities', defaultPrefix: 'ENT' }
      )
    );

    const result = createEngineResult({
      items,
      coverage: {
        status: 'PARTIAL',
        reason: 'HEURISTIC_FROM_FR',
        sourceStats: { sourceRows: 0, mappedRows: items.length, orphanRows: 0 },
      },
      validation: {
        errors: [],
        warnings: [{ code: 'HEURISTIC_DATA', message: 'Entity candidates from FR nouns' }],
      },
      meta,
    });
    assertNoSrsDraftInEngineResult(result);
    return result;
  } catch (err) {
    return failedResult(meta, [{ message: err.message, code: err.code || 'ENGINE_ERROR' }]);
  }
}

module.exports = { id: 'data', section: 'entities', run };
