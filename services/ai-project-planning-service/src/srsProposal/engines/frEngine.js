/**
 * FREngine — adapter over existing G4 / proposal fragment.
 * Does not re-implement G4; does not write other sections or srsDraft.
 */

const {
  createEngineResult,
  noDataResult,
  failedResult,
  assertNoSrsDraftInEngineResult,
} = require('../contracts/analysisEngineContract');
const {
  normalizeProposalItem,
  assertBrDerivedFrInvariant,
} = require('../contracts/proposalItem');

function run(input = {}) {
  const meta = { engineId: 'fr', section: 'functionalRequirements', version: 1 };
  try {
    // Prefer precomputed fragment from G4 analyze
    const fragment = input.ownedSectionProjection?.proposalFragment || input.proposalFragment;
    const existingItems =
      input.ownedSectionProjection?.items ||
      input.context?.pack?.functionalRequirements ||
      input.upstreamFragments?.functionalRequirements?.items;

    let rawItems = [];
    if (fragment?.section === 'functionalRequirements' && Array.isArray(fragment.items)) {
      rawItems = fragment.items;
    } else if (Array.isArray(existingItems)) {
      rawItems = existingItems;
    } else if (Array.isArray(input.ownedSectionProjection?.rows)) {
      rawItems = input.ownedSectionProjection.rows;
    }

    const { isCustomerRequirementId } = require('../../engines/frProposeFromCrLlm');
    const beforeFilter = rawItems.length;
    rawItems = rawItems.filter((row) => {
      const id = String(row?.logicalId || row?.id || row?.frId || row?.externalId || '').trim();
      return id && !isCustomerRequirementId(id);
    });

    if (!rawItems.length) {
      const gap = noDataResult(
        meta,
        beforeFilter > 0 ? 'missing_proposed_fr' : 'SOURCE_UNAVAILABLE'
      );
      assertNoSrsDraftInEngineResult(gap);
      return gap;
    }

    const items = rawItems.map((row, i) => {
      assertBrDerivedFrInvariant(row);
      return normalizeProposalItem(row, {
        index: i,
        engineId: 'fr',
        section: 'functionalRequirements',
        defaultPrefix: 'FR',
      });
    });

    const result = createEngineResult({
      items,
      relations: Array.isArray(fragment?.relations) ? fragment.relations : [],
      clarificationQuestions: Array.isArray(fragment?.clarificationQuestions)
        ? fragment.clarificationQuestions
        : [],
      coverage: {
        status: items.length ? 'AVAILABLE' : 'NO_DATA',
        sourceStats: { sourceRows: rawItems.length, mappedRows: items.length, orphanRows: 0 },
      },
      validation: { errors: [], warnings: [] },
      meta: {
        ...meta,
        frDecomposeSkipped: Boolean(fragment?.meta?.frDecomposeSkipped),
        frDecomposeReason: fragment?.meta?.frDecomposeReason || null,
      },
    });
    // Epic→Story SoT from FrDecompose (attached on proposalFragment after G4).
    if (fragment?.backlogStructure && typeof fragment.backlogStructure === 'object') {
      result.backlogStructure = fragment.backlogStructure;
    }
    assertNoSrsDraftInEngineResult(result);
    return result;
  } catch (err) {
    if (err.code === 'BR_FR_INVARIANT') {
      return failedResult(meta, [{ message: err.message, code: err.code }]);
    }
    return failedResult(meta, [{ message: err.message, code: err.code || 'ENGINE_ERROR' }]);
  }
}

module.exports = { id: 'fr', section: 'functionalRequirements', run };
