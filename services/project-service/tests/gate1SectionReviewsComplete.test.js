/**

 * Meta Gate: exactly 12 analysis sectionReviews; no legacy foundation keys.

 */



const { describe, it } = require('node:test');

const assert = require('node:assert/strict');



const { runMetaGate } = require('../src/utils/srsProposal/metaGate');

const { computeGate1Readiness } = require('../src/utils/srsProposal/gate1ReadinessPolicy');

const { applyProposalFragment, createEmptySrsProposal } = require('../src/utils/srsProposal');

const {

  ANALYSIS_SECTION_KEYS,

  LEGACY_SECTION_KEYS,

} = require('../src/utils/srsProposal/contracts/analysisSections');

const { populateNonFrSections } = require('../src/utils/srsProposal/populateNonFrSections');



describe('gate1SectionReviewsComplete', () => {

  it('Meta Gate emits exactly one review per ANALYSIS_SECTION_KEYS', () => {

    let p = applyProposalFragment(createEmptySrsProposal(), {

      section: 'functionalRequirements',

      items: [{ logicalId: 'FR-1', title: 'A', sourceRefs: [{ documentId: 'd1' }] }],

    });

    p = runMetaGate(p, {});

    const reviews = p.completeness.sectionReviews;

    assert.equal(reviews.length, ANALYSIS_SECTION_KEYS.length);

    assert.equal(reviews.length, 12);

    const sections = reviews.map((r) => r.section).sort();

    assert.deepEqual(sections, [...ANALYSIS_SECTION_KEYS].sort());

    for (const legacy of LEGACY_SECTION_KEYS) {

      assert.equal(

        reviews.some((r) => r.section === legacy),

        false,

        `legacy section ${legacy} must not appear in sectionReviews`

      );

    }

  });



  it('softGaps cover empty analysis sections without blocking readyForGate1', () => {

    let p = applyProposalFragment(createEmptySrsProposal(), {

      section: 'functionalRequirements',

      items: [{ logicalId: 'FR-1', title: 'A', sourceRefs: [{ documentId: 'd1' }] }],

    });

    p = populateNonFrSections(p, { pack: {} });

    assert.equal(p.completeness.readyForGate1, true);

    assert.equal(p.completeness.sectionReviews.length, 12);



    const readiness = computeGate1Readiness(p);

    assert.equal(readiness.readyForGate1, true);

    assert.ok(readiness.softGaps.some((g) => g.section === 'businessRules'));

    assert.ok(readiness.softGaps.some((g) => g.section === 'businessGoals'));

    assert.ok(readiness.softGaps.some((g) => g.section === 'processes'));

    assert.ok(readiness.softGaps.some((g) => g.section === 'interfaces'));

    assert.equal(

      readiness.softGaps.some((g) => g.section === 'functionalRequirements' && g.reason !== 'evidence_traceability'),

      false

    );

  });

});

