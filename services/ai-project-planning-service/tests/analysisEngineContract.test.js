/**
 * APS Analysis Engine contract (FR emit path).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeProposalItem,
  assertBrDerivedFrInvariant,
  assertNoSrsDraftInEngineResult,
} = require('../src/requirementAnalysis/contracts');
const {
  buildFunctionalRequirementProposal,
} = require('../src/requirementAnalysis/functionalRequirements/buildFunctionalRequirementProposal');

describe('APS FR proposal contract', () => {
  it('emits origin/provenance/sourceRefs', () => {
    const frag = buildFunctionalRequirementProposal({
      validated: {
        accepted: {
          requirements: [
            {
              id: 'FR-1',
              title: 'A',
              sourceRefs: [{ documentId: 'd1', sheet: 'FR', row: 2 }],
            },
            {
              id: 'FR-BR',
              title: 'From BR',
              derivedFromBr: 'BR-1',
              status: 'EXTRACTED',
            },
          ],
        },
      },
    });
    assert.equal(frag.section, 'functionalRequirements');
    assert.equal(frag.items[0].origin.engine, 'fr');
    assert.ok(Array.isArray(frag.items[0].sourceRefs));
    assert.equal(frag.items[1].status, 'PROPOSED');
    assert.equal(frag.items[1].origin.type, 'DERIVED');
  });

  it('rejects BR-derived ACCEPTED at assert', () => {
    assert.throws(
      () =>
        assertBrDerivedFrInvariant({
          id: 'FR-X',
          derivedFromBr: 'BR-1',
          status: 'ACCEPTED',
        }),
      (e) => e.code === 'BR_FR_INVARIANT'
    );
  });

  it('forbids srsDraft on result', () => {
    assert.throws(
      () => assertNoSrsDraftInEngineResult({ srsDraft: {} }),
      (e) => e.code === 'ENGINE_SRS_BOUNDARY'
    );
    const item = normalizeProposalItem({ id: 'FR-1', title: 'T' }, { engineId: 'fr' });
    assert.equal(item.origin.engine, 'fr');
  });
});
