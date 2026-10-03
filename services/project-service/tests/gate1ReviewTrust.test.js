/**
 * Gate1 Wave A — decision batch, revision chain, audit pointers (in-memory store).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  applyGate1DecisionBatch,
  buildSubmissionFromBatchResult,
  createMemoryRevisionStore,
  GATE1_AUDIT_ACTIONS,
  newReviewId,
} = require('../src/utils/srsProposal/gateReviewCommands');
const { createEmptySrsProposal, applyProposalFragment } = require('../src/utils/srsProposal');
const { hashRevisionContent } = require('../src/utils/srsProposal/artifactRevision');

function makeProposal() {
  let p = createEmptySrsProposal();
  p = applyProposalFragment(p, {
    section: 'functionalRequirements',
    items: [
      { id: 'FR-1', logicalId: 'FR-1', title: 'Login', status: 'EXTRACTED' },
      { id: 'FR-2', logicalId: 'FR-2', title: 'Logout', status: 'EXTRACTED' },
    ],
    relations: [],
    clarificationQuestions: [],
  });
  return p;
}

describe('applyGate1DecisionBatch', () => {
  it('creates AI baseline then EDIT creates REV-2 with parent; audit pointers only', async () => {
    const store = createMemoryRevisionStore();
    const audits = [];
    const pack = {
      _id: 'pack1',
      projectId: 'proj1',
      aiAnalysisActiveSnapshotId: 'snap-1',
    };
    const reviewId = newReviewId();
    const proposal = makeProposal();

    const result = await applyGate1DecisionBatch({
      pack,
      proposal,
      reviewId,
      userId: 'ba1',
      organizationId: 'org1',
      reviewDecisions: {
        'FR-1': {
          action: 'edit',
          editedPayload: { title: 'Login with SSO' },
          note: 'clarify SSO',
        },
        'FR-2': { action: 'accept', note: 'ok', resolution: 'ok' },
      },
      store,
      recordGate1Audit: async (evt) => {
        audits.push(evt);
      },
    });

    const fr1Tips = store.rows.filter((r) => r.logicalId === 'FR-1');
    assert.equal(fr1Tips.length, 2);
    assert.equal(fr1Tips[0].revisionNo, 1);
    assert.equal(fr1Tips[1].revisionNo, 2);
    assert.equal(fr1Tips[1].parentRevisionId, fr1Tips[0].revisionId);
    assert.equal(
      fr1Tips[0].contentHash,
      hashRevisionContent(fr1Tips[0].content)
    );
    assert.notEqual(fr1Tips[0].contentHash, fr1Tips[1].contentHash);

    assert.equal(result.proposal.review.decisions['FR-1'].action, 'edit');
    assert.equal(
      result.proposal.review.decisions['FR-1'].revisionId,
      fr1Tips[1].revisionId
    );
    assert.equal(
      result.proposal.generated.functionalRequirements.items.find((i) => i.logicalId === 'FR-1')
        .title,
      'Login with SSO'
    );

    const editAudit = audits.find((a) => a.action === GATE1_AUDIT_ACTIONS.REVIEW_EDITED);
    assert.ok(editAudit);
    assert.equal(editAudit.fromRevisionId, fr1Tips[0].revisionId);
    assert.equal(editAudit.toRevisionId, fr1Tips[1].revisionId);
    assert.equal(editAudit.snapshotId, 'snap-1');
    // no proposal blob
    assert.equal(editAudit.srsProposal, undefined);
    assert.ok(!JSON.stringify(editAudit).includes('functionalRequirements'));

    const acceptAudit = audits.find((a) => a.action === GATE1_AUDIT_ACTIONS.REVIEW_ACCEPTED);
    assert.ok(acceptAudit);
    assert.equal(acceptAudit.logicalId, 'FR-2');
  });

  it('REVISION_CONFLICT when expectedRevisionId mismatches tip', async () => {
    const store = createMemoryRevisionStore();
    const pack = { _id: 'pack1', projectId: 'proj1' };
    const reviewId = newReviewId();
    const proposal = makeProposal();

    await assert.rejects(
      () =>
        applyGate1DecisionBatch({
          pack,
          proposal,
          reviewId,
          userId: 'ba1',
          organizationId: 'org1',
          reviewDecisions: { 'FR-1': { action: 'accept' } },
          expectedRevisionIds: { 'FR-1': 'REV-does-not-exist' },
          store,
          recordGate1Audit: async () => {},
        }),
      (err) => err.errorCode === 'REVISION_CONFLICT'
    );
  });

  it('legacy decision without inventing REVIEW_ACCEPTED on baseline', async () => {
    const store = createMemoryRevisionStore();
    const audits = [];
    const pack = { _id: 'pack1' };
    let proposal = makeProposal();
    proposal.review = {
      decisions: {
        'FR-1': { action: 'accept', by: 'old-ba', at: '2020-01-01T00:00:00Z' },
      },
    };

    await applyGate1DecisionBatch({
      pack,
      proposal,
      reviewId: newReviewId(),
      userId: 'ba1',
      organizationId: 'org1',
      reviewDecisions: {},
      store,
      recordGate1Audit: async (evt) => audits.push(evt),
    });

    const legacy = audits.filter(
      (a) => a.action === GATE1_AUDIT_ACTIONS.LEGACY_BASELINE_IMPORTED
    );
    assert.ok(legacy.length >= 1);
    const fakeAccept = audits.filter(
      (a) => a.action === GATE1_AUDIT_ACTIONS.REVIEW_ACCEPTED
    );
    assert.equal(fakeAccept.length, 0);
  });

  it('second submission sequence increments in helper output', async () => {
    const store = createMemoryRevisionStore();
    const pack = { _id: 'pack1', projectId: 'proj1' };
    const reviewId = newReviewId();
    const proposal = makeProposal();
    const batch = await applyGate1DecisionBatch({
      pack,
      proposal,
      reviewId,
      userId: 'ba1',
      organizationId: 'org1',
      reviewDecisions: { 'FR-1': { action: 'accept' }, 'FR-2': { action: 'accept' } },
      store,
      recordGate1Audit: async () => {},
    });
    const sub1 = buildSubmissionFromBatchResult({
      pack,
      proposal: batch.proposal,
      reviewId,
      sequenceNo: 1,
      userId: 'ba1',
      organizationId: 'org1',
      tipRevisionByLogicalId: batch.tipRevisionByLogicalId,
    });
    const sub2 = buildSubmissionFromBatchResult({
      pack,
      proposal: batch.proposal,
      reviewId,
      sequenceNo: 2,
      userId: 'ba1',
      organizationId: 'org1',
      tipRevisionByLogicalId: batch.tipRevisionByLogicalId,
    });
    assert.equal(sub1.sequenceNo, 1);
    assert.equal(sub2.sequenceNo, 2);
    assert.notEqual(sub1.submissionId, sub2.submissionId);
  });

  it('buildSubmissionFromBatchResult has stable manifestHash', async () => {
    const store = createMemoryRevisionStore();
    const pack = { _id: 'pack1', projectId: 'proj1' };
    const reviewId = newReviewId();
    const proposal = makeProposal();
    const batch = await applyGate1DecisionBatch({
      pack,
      proposal,
      reviewId,
      userId: 'ba1',
      organizationId: 'org1',
      reviewDecisions: {
        'FR-1': { action: 'accept' },
        'FR-2': { action: 'accept' },
      },
      store,
      recordGate1Audit: async () => {},
    });
    const sub = buildSubmissionFromBatchResult({
      pack,
      proposal: batch.proposal,
      reviewId,
      sequenceNo: 1,
      userId: 'ba1',
      organizationId: 'org1',
      tipRevisionByLogicalId: batch.tipRevisionByLogicalId,
    });
    assert.ok(sub.submissionId);
    assert.ok(sub.manifestHash.startsWith('sha256:'));
    assert.equal(sub.revisionManifest.length, 2);
  });
});
