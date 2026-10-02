/**
 * srsProposal waves — reducer, migrate, completeness, review, CAS, materialize, T-X*.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createEmptySrsProposal,
  applyProposalFragment,
  migrateLegacyRequirementAnalysis,
  computeCompleteness,
  applyCompleteness,
  applyReviewDecision,
  computeReviewSummary,
  isReviewComplete,
  assertProposalCallbackCas,
  buildEvidencePack,
  resolveProposalEvidence,
  normalizeCustomerRawRecord,
  buildSlimSnapshotFromRawRecord,
  buildFrInputProjection,
  buildFoundationUnderstanding,
  applyFoundationToProposal,
  buildBusinessUnderstanding,
  deriveProposedFrFromBusinessRules,
  applyBusinessToProposal,
  buildNfrRuleScopeFragments,
  applyNfrRuleScopeToProposal,
  buildProcessUcEntity,
  applyProcessUcEntityToProposal,
  applyCrossAndSynthesis,
  materializeSrsDraft,
  approveSrsDraft,
  populateNonFrSections,
} = require('../src/utils/srsProposal');

const {
  applyRequirementProposalToContainer,
  hasReadySrsProposal,
} = require('../src/utils/aiAnalysis/whatRequirementPolicy');

describe('srsProposal W0 reducer + migrate', () => {
  it('section-scoped FR reducer', () => {
    let p = createEmptySrsProposal();
    p = applyProposalFragment(p, {
      section: 'functionalRequirements',
      items: [{ id: 'FR-1', title: 'A', status: 'EXTRACTED' }],
      relations: [{ from: 'FR-1', to: 'FR-2', type: 'related' }],
      clarificationQuestions: [],
    });
    assert.equal(p.generated.functionalRequirements.items.length, 1);
    assert.equal(p.generated.nonFunctionalRequirements.items.length, 0);
  });

  it('migrate legacy: synthesis NOT into functionalRequirements', () => {
    const proposal = migrateLegacyRequirementAnalysis({
      requirements: [{ id: 'FR-1', title: 'T' }],
      relationships: [],
      ambiguities: [{ requirementId: 'FR-1', message: 'unclear' }],
      synthesis: 'legacy summary text',
    });
    assert.equal(proposal.generated.functionalRequirements.items[0].id, 'FR-1');
    assert.ok(proposal.generated._legacySynthesisDisplay);
    assert.equal(proposal.generated.functionalRequirements.meta?.synthesis, undefined);
  });
});

describe('srsProposal W1–W3 raw/foundation/business', () => {
  it('CustomerRawRecord + slim snapshot + fr projection without process', () => {
    const raw = normalizeCustomerRawRecord({
      recordId: 'r1',
      documents: [{ id: 'd1', name: 'a.xlsx' }],
    });
    const slim = buildSlimSnapshotFromRawRecord(raw, {
      functionalRequirements: [{ id: 'FR-1' }],
    });
    const proj = buildFrInputProjection({ ...slim, process: { should: 'drop' } });
    assert.ok(!('process' in proj));
    assert.equal(proj.requirements[0].id, 'FR-1');
  });

  it('foundation + business BR→FR PROPOSED', () => {
    let p = createEmptySrsProposal();
    const foundation = buildFoundationUnderstanding({
      actors: [{ name: 'Emp' }],
      domain: { name: 'HR' },
      evidenceRaw: { documents: [{ documentId: 'd1' }], spans: [], rows: [] },
    });
    p = applyFoundationToProposal(p, foundation);
    assert.ok(p.meta?.evidencePack);
    assert.equal(p.generated.actors.items.length, 0);
    const business = buildBusinessUnderstanding({
      goals: [{ title: 'G1' }],
      rules: [{ id: 'BR-1', title: 'Must clock in' }],
    });
    p = applyBusinessToProposal(p, business);
    const derived = deriveProposedFrFromBusinessRules(business.businessRules);
    assert.equal(derived[0].status, 'PROPOSED');
    assert.ok(p.generated.businessRules.items.length);
  });
});

describe('srsProposal W4–W6 nfr/process/cross/completeness', () => {
  it('NFR/scope + process after FR + synthesis ≠ completeness', () => {
    let p = createEmptySrsProposal();
    p = applyProposalFragment(p, {
      section: 'functionalRequirements',
      items: [{ logicalId: 'FR-1', id: 'FR-1', title: 'A', sourceRefs: [{ documentId: 'd1' }] }],
    });
    const nfr = buildNfrRuleScopeFragments({
      nfr: [{ title: 'Perf' }],
      scope: [{ title: 'In', inScope: true }],
    });
    p = applyNfrRuleScopeToProposal(p, nfr);
    const proc = buildProcessUcEntity({
      functionalRequirements: p.generated.functionalRequirements.items,
    });
    p = applyProcessUcEntityToProposal(p, proc);
    p = applyCrossAndSynthesis(p, {
      synthesis: { summary: 'AI says enough NFR', coverageObservations: ['nfr ok'] },
    });
    assert.ok(p.generated.synthesis?.summary);
    assert.notEqual(p.generated.synthesis.summary, p.completeness?.coverage?.nonFunctionalRequirements);
    assert.equal(typeof p.completeness.readyForGate1, 'boolean');
    // AI hint must not force system COVERED for unrelated fields
    assert.ok(p.completeness.coverage.functionalRequirements === 'COVERED');
  });

  it('resolveProposalEvidence scoped', () => {
    const pack = buildEvidencePack({
      documents: [{ documentId: 'd1' }],
      spans: [{ spanId: 's1', documentId: 'd1', text: 'hello' }],
    });
    const hit = resolveProposalEvidence(pack, { documentId: 'd1', spanId: 's1' });
    assert.equal(hit.text, 'hello');
    assert.throws(() => resolveProposalEvidence(pack, { documentId: 'd1' }));
  });
});

describe('srsProposal W2 populateNonFr after FR', () => {
  it('fills UC stubs + NFR from pack sheets without wiping FR', () => {
    let p = applyProposalFragment(createEmptySrsProposal(), {
      section: 'functionalRequirements',
      items: [{ logicalId: 'FR-1', id: 'FR-1', title: 'Enroll', sourceRefs: [{ documentId: 'd1' }] }],
    });
    p = populateNonFrSections(p, {
      pack: {
        businessRules: [{ id: 'BR-1', title: 'Rule A', description: 'Must validate' }],
        nonFunctionalRequirements: [{ id: 'NFR-1', title: 'Perf', description: 'p95 < 200ms' }],
        actors: [{ id: 'ACT-1', name: 'Student' }],
      },
    });
    assert.equal(p.generated.functionalRequirements.items[0].logicalId, 'FR-1');
    assert.ok(p.generated.businessRules.items.length >= 1);
    assert.ok(p.generated.nonFunctionalRequirements.items.length >= 1);
    assert.ok(p.generated.useCases.items.length >= 1);
    // Foundation no longer writes actors (Analysis engine ownership)
    assert.equal(p.generated.actors.items.length, 0);
    assert.equal(p.meta?.kind, 'requirement_analysis_proposal');
    assert.ok(Array.isArray(p.completeness?.sectionReviews));
  });

  it('callback with populateNonFr wires sections', () => {
    const container = applyRequirementProposalToContainer(
      { analyses: {} },
      {
        section: 'functionalRequirements',
        items: [{ logicalId: 'FR-9', id: 'FR-9', title: 'X', sourceRefs: [{ documentId: 'd1' }] }],
      },
      {
        populateNonFr: true,
        pack: { businessRules: [{ title: 'BR' }], actors: [{ name: 'A' }] },
        generationId: 'run-1',
      }
    );
    assert.ok(hasReadySrsProposal(container));
    assert.ok(container.analyses.srsProposal.generated.businessRules.items.length >= 1);
  });
});

describe('srsProposal W7 review / CAS / materialize / T-X18 / T-X19', () => {
  it('readyForGate1 ≠ reviewComplete; materialize needs reviewComplete', () => {
    let p = applyCompleteness(
      applyProposalFragment(createEmptySrsProposal(), {
        section: 'functionalRequirements',
        items: [
          {
            logicalId: 'FR-1',
            id: 'FR-1',
            title: 'A',
            sourceRefs: [{ documentId: 'd1', spanId: 's1' }],
          },
        ],
      })
    );
    assert.equal(p.completeness.readyForGate1, true);
    assert.equal(isReviewComplete(p), false);

    p = applyReviewDecision(p, 'FR-1', { action: 'accept' }, { userId: 'ba1' });
    assert.equal(isReviewComplete(p), true);

    const draft = materializeSrsDraft(p, { userId: 'ba1' });
    assert.equal(draft.kind, 'srs_draft');
    assert.equal(draft.approvedSrsVersionManifest, null);

    const { approvedSrsVersionManifest } = approveSrsDraft(draft, { userId: 'po1' });
    assert.equal(approvedSrsVersionManifest.source, 'po_approve');
  });

  it('NEEDS_CONFIRMATION accept requires note+resolution', () => {
    let p = applyProposalFragment(createEmptySrsProposal(), {
      section: 'functionalRequirements',
      items: [],
      clarificationQuestions: [
        { logicalId: 'CQ-1', status: 'NEEDS_CONFIRMATION', message: '?' },
      ],
    });
    assert.throws(
      () => applyReviewDecision(p, 'CQ-1', { action: 'accept' }),
      (err) => err.errorCode === 'NEEDS_CONFIRMATION_ACCEPT_REQUIRES_NOTE_RESOLUTION'
    );
    p = applyReviewDecision(
      p,
      'CQ-1',
      { action: 'accept', note: 'ok', resolution: 'clarified' },
      { userId: 'ba' }
    );
    assert.ok(p.review.decisions['CQ-1']);
  });

  it('T-X19 stale generation callback rejected', () => {
    const current = createEmptySrsProposal({ generationId: 'gen-5', proposalVersion: 5 });
    const cas = assertProposalCallbackCas(current, {
      generationId: 'gen-4',
      proposalVersion: 4,
    });
    assert.equal(cas.ok, false);
    assert.equal(cas.errorCode, 'STALE_GENERATION');
  });

  it('T-X18 approved manifest unchanged on proposal rerun', () => {
    const container = applyRequirementProposalToContainer(
      {},
      {
        section: 'functionalRequirements',
        items: [{ logicalId: 'FR-1', id: 'FR-1', title: 'A', sourceRefs: [{ documentId: 'd1' }] }],
      },
      { generationId: 'gen-1', remoteRunId: 'gen-1' }
    );
    container.analyses.approvedSrsVersionManifest = {
      manifestId: 'm1',
      approvedSrsVersion: 'v1',
      source: 'po_approve',
    };
    const next = applyRequirementProposalToContainer(
      container,
      {
        section: 'functionalRequirements',
        items: [{ logicalId: 'FR-2', id: 'FR-2', title: 'B', sourceRefs: [{ documentId: 'd1' }] }],
      },
      { generationId: 'gen-2', remoteRunId: 'gen-2' }
    );
    assert.equal(next.analyses.approvedSrsVersionManifest.manifestId, 'm1');
    assert.ok(hasReadySrsProposal(next));
    assert.ok(!next.analyses.g4Understanding);
  });

  it('T-G4-NOWRITE: applyRequirementProposal never writes g4Understanding', () => {
    const next = applyRequirementProposalToContainer(
      { analyses: {} },
      {
        requirements: [{ id: 'FR-1', title: 'A' }],
        synthesis: 'should not land in FR',
      },
      { generationId: 'g1', remoteRunId: 'g1' }
    );
    assert.ok(next.analyses.srsProposal);
    assert.equal(next.analyses.g4Understanding, undefined);
    assert.ok(next.analyses.srsProposal.generated._legacySynthesisDisplay);
  });
});
