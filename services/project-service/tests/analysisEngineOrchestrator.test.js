/**
 * DAG orchestrator — order, isolation, no srsDraft, Meta outside.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { runAnalysisEnginesSync } = require('../src/utils/srsProposal/engines/runAnalysisEnginesSync');
const { runMetaGate } = require('../src/utils/srsProposal/metaGate');
const { computeGate1Readiness } = require('../src/utils/srsProposal/gate1ReadinessPolicy');
const { applyProposalFragment, createEmptySrsProposal } = require('../src/utils/srsProposal');
const { ANALYSIS_ENGINE_REGISTRY, topologicalLayers } = require('../src/utils/srsProposal/contracts');

describe('runAnalysisEnginesSync DAG', () => {
  it('runs UC after FR layer; Traceability last among engines', () => {
    const layers = topologicalLayers();
    const flat = layers.flat();
    assert.ok(flat.indexOf('fr') < flat.indexOf('uc'));
    assert.equal(flat[flat.length - 1], 'traceability');
    assert.equal(ANALYSIS_ENGINE_REGISTRY.some((e) => e.id === 'meta'), false);
  });

  it('orchestrates pack sources without writing srsDraft', () => {
    let proposal = applyProposalFragment(createEmptySrsProposal(), {
      section: 'functionalRequirements',
      items: [
        {
          logicalId: 'FR-1',
          title: 'Enroll',
          sourceRefs: [{ documentId: 'd1', sheet: 'FR', row: 1 }],
        },
      ],
    });
    const out = runAnalysisEnginesSync({
      proposal,
      pack: {
        businessRules: [{ id: 'BR-1', title: 'Rule', sourceRefs: [{ documentId: 'd1' }] }],
        businessProcesses: [],
      },
      skipFrIfPresent: true,
    });
    assert.ok(out.executionOrder.indexOf('uc') > -1);
    assert.ok(out.executionOrder.indexOf('traceability') > -1);
    assert.ok(out.resultsById.br.items.length >= 1);
    assert.equal(out.resultsById.bpm.coverage.status, 'NO_DATA');
    assert.equal(out.proposal.analyses?.srsDraft, undefined);
    assert.ok(out.proposal.generated.useCases.items.length >= 1);
    assert.equal(out.proposal.generated.useCases.items[0].provenance.type, 'HEURISTIC');
  });

  it('FAILED engine does not wipe other results', () => {
    const out = runAnalysisEnginesSync({
      proposal: createEmptySrsProposal(),
      pack: {
        businessGoals: [{ id: 'BG-1', title: 'G' }],
      },
      forceFr: true,
      projections: {
        fr: {
          items: [{ id: 'FR-BAD', derivedFromBr: 'BR-1', status: 'ACCEPTED', title: 'bad' }],
        },
      },
      skipFrIfPresent: false,
    });
    assert.equal(out.resultsById.fr.execution.status, 'FAILED');
    assert.equal(out.resultsById.bg.execution.status, 'SUCCESS');
    assert.ok(out.resultsById.bg.items.length >= 1);
  });

  it('skip fr still lifts FR clarificationQuestions into assumption', () => {
    let proposal = applyProposalFragment(createEmptySrsProposal(), {
      section: 'functionalRequirements',
      items: [
        {
          logicalId: 'FR-1',
          title: 'Enroll',
          sourceRefs: [{ documentId: 'd1', sheet: 'FR', row: 1 }],
        },
      ],
      clarificationQuestions: [
        {
          logicalId: 'CQ-1',
          requirementId: 'FR-1',
          message: 'Clarify actor?',
          status: 'NEEDS_CONFIRMATION',
        },
      ],
    });
    const out = runAnalysisEnginesSync({
      proposal,
      pack: {},
      skipFrIfPresent: true,
    });
    assert.equal(out.executionOrder.includes('fr'), false);
    assert.ok(out.resultsById.fr);
    assert.equal(out.resultsById.fr.meta.syntheticFromProposal, true);
    assert.ok(out.resultsById.assumption.items.length >= 1);
    const lifted = out.resultsById.assumption.items.find(
      (it) => it.classification === 'OPEN_QUESTION' || String(it.logicalId).includes('CQ')
    );
    assert.ok(lifted, 'expected OPEN_QUESTION lifted from FR CQ');
    assert.ok(out.proposal.generated.assumptions.items.length >= 1);
  });
});

describe('Meta Gate + Gate1 policy', () => {
  it('BR/BPM empty does not force readyForGate1 false when FR present', () => {
    let p = applyProposalFragment(createEmptySrsProposal(), {
      section: 'functionalRequirements',
      items: [{ logicalId: 'FR-1', title: 'A', sourceRefs: [{ documentId: 'd1' }] }],
    });
    p = runMetaGate(p, {
      resultsById: {
        fr: {
          items: p.generated.functionalRequirements.items,
          coverage: { status: 'AVAILABLE' },
          validation: { errors: [], warnings: [] },
          meta: { section: 'functionalRequirements' },
        },
        br: {
          items: [],
          coverage: { status: 'NO_DATA', reason: 'SOURCE_UNAVAILABLE' },
          validation: { errors: [], warnings: [] },
          meta: { section: 'businessRules' },
        },
      },
    });
    assert.equal(p.completeness.readyForGate1, true);
    assert.ok(Array.isArray(p.completeness.sectionReviews));
    assert.equal(p.completeness.sectionReviews.length, 12);
    assert.equal(p.meta.kind, 'requirement_analysis_proposal');

    const readiness = computeGate1Readiness(p);
    assert.equal(readiness.readyForGate1, true);
    assert.ok(readiness.softGaps.some((g) => g.section === 'businessRules'));
    assert.ok(readiness.softGaps.some((g) => g.section === 'businessGoals'));
  });
});
