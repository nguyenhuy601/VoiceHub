/**
 * T5 companion — full srsProposal CAS apply without populateNonFr
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  applyRequirementProposalToContainer,
} = require('../src/utils/aiAnalysis/whatG4Policy');
const { createEmptySrsProposal } = require('../src/utils/srsProposal/srsProposalSchema');
const { applyCompleteness } = require('../src/utils/srsProposal/completeness');
const { runMetaGate } = require('../src/utils/srsProposal/metaGate');

describe('callbackFullSrsProposalNoPopulate', () => {
  it('applies full proposal without populateNonFr', () => {
    let proposal = createEmptySrsProposal({ source: 'aps_graph' });
    proposal.generationId = 'gen-1';
    proposal.generated.functionalRequirements = {
      items: [
        {
          logicalId: 'CR-1',
          title: 'Login',
          description: 'd',
          status: 'EXTRACTED',
          origin: { type: 'EXTRACTED', engine: 'fr', section: 'functionalRequirements' },
          provenance: {
            type: 'EXTRACTED',
            producer: 'deterministic',
            rule: 'SOURCE_INGEST',
            derivedFrom: [],
          },
          sourceRefs: [],
        },
      ],
      meta: {},
    };
    proposal = runMetaGate(proposal, { resultsById: {} });
    proposal = applyCompleteness(proposal);

    const container = applyRequirementProposalToContainer({}, proposal, {
      generationId: 'gen-1',
      populateNonFr: false,
      status: 'ready',
    });

    assert.ok(container.analyses.srsProposal);
    assert.equal(container.analyses.g4Understanding, undefined);
    const reviews = container.analyses.srsProposal.completeness?.sectionReviews || [];
    assert.equal(reviews.length, 12);
    assert.equal(
      (container.analyses.srsProposal.generated?.businessRules?.items || []).length,
      0
    );
  });
});
