const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  applyOneDecisionPure,
  GATE1_CREATE_ALLOWED_SECTIONS,
} = require('../src/utils/srsProposal/gateReviewCommands');
const { detectSensitiveGate1Edits } = require('../src/utils/srsProposal/sensitiveGate1Sections');
const { ORIGIN_BA_CREATED } = require('../src/utils/srsProposal/artifactRevision');

function emptyProposal() {
  return {
    reviewVersion: 1,
    generated: {
      actors: { items: [{ logicalId: 'user', title: 'Người dùng', status: 'PROPOSED' }] },
      functionalRequirements: { items: [{ logicalId: 'FR-1', title: 'Login', status: 'EXTRACTED' }] },
    },
    review: { decisions: {}, locks: {}, summary: {} },
  };
}

const pack = { _id: 'pack1', projectId: 'proj1' };

describe('GATE1_CREATE_ALLOWED_SECTIONS', () => {
  it('includes useCases and actors', () => {
    assert.ok(GATE1_CREATE_ALLOWED_SECTIONS.includes('actors'));
    assert.ok(GATE1_CREATE_ALLOWED_SECTIONS.includes('useCases'));
    assert.ok(GATE1_CREATE_ALLOWED_SECTIONS.includes('functionalRequirements'));
  });
});

describe('applyOneDecisionPure create', () => {
  it('inserts actor item + BA_CREATED revision', () => {
    const proposal = emptyProposal();
    const result = applyOneDecisionPure({
      proposal,
      logicalId: 'ACT-1',
      decision: {
        action: 'create',
        section: 'actors',
        editedPayload: { title: 'Quản trị viên' },
      },
      tips: new Map(),
      userId: 'ba-1',
      organizationId: 'org-1',
      pack,
      reviewId: 'rev-1',
      expectedReviewVersion: 1,
    });

    const items = result.proposal.generated.actors.items;
    assert.equal(items.length, 2);
    const created = items.find((x) => x.logicalId === 'ACT-1');
    assert.ok(created);
    assert.equal(created.title, 'Quản trị viên');
    assert.equal(created.provenance.type, 'BA_ADDED');
    assert.equal(result.proposal.review.decisions['ACT-1'].action, 'create');
    assert.equal(result.newRevision.origin, ORIGIN_BA_CREATED);
    assert.equal(result.newRevision.revisionNo, 1);
    assert.equal(result.audit.action, 'REVIEW_CREATED');
  });

  it('rejects missing title', () => {
    assert.throws(
      () =>
        applyOneDecisionPure({
          proposal: emptyProposal(),
          logicalId: 'ACT-1',
          decision: { action: 'create', section: 'actors', editedPayload: {} },
          tips: new Map(),
          userId: 'ba-1',
          organizationId: 'org-1',
          pack,
          reviewId: 'rev-1',
        }),
      (err) => err.errorCode === 'GATE1_CREATE_TITLE_REQUIRED'
    );
  });

  it('rejects duplicate logicalId', () => {
    assert.throws(
      () =>
        applyOneDecisionPure({
          proposal: emptyProposal(),
          logicalId: 'user',
          decision: {
            action: 'create',
            section: 'actors',
            editedPayload: { title: 'Dup' },
          },
          tips: new Map(),
          userId: 'ba-1',
          organizationId: 'org-1',
          pack,
          reviewId: 'rev-1',
        }),
      (err) => err.errorCode === 'PROPOSAL_ITEM_ALREADY_EXISTS'
    );
  });

  it('creates useCases item', () => {
    const result = applyOneDecisionPure({
      proposal: emptyProposal(),
      logicalId: 'UC-7',
      decision: {
        action: 'create',
        section: 'useCases',
        editedPayload: { title: 'UC mới' },
      },
      tips: new Map(),
      userId: 'ba-1',
      organizationId: 'org-1',
      pack,
      reviewId: 'rev-1',
    });
    const items = result.proposal.generated.useCases.items;
    assert.equal(items.length, 1);
    assert.equal(items[0].logicalId, 'UC-7');
    assert.equal(items[0].title, 'UC mới');
  });

  it('rejects unknown section', () => {
    assert.throws(
      () =>
        applyOneDecisionPure({
          proposal: emptyProposal(),
          logicalId: 'X-1',
          decision: {
            action: 'create',
            section: 'unknownSection',
            editedPayload: { title: 'Nope' },
          },
          tips: new Map(),
          userId: 'ba-1',
          organizationId: 'org-1',
          pack,
          reviewId: 'rev-1',
        }),
      (err) => err.errorCode === 'GATE1_CREATE_SECTION_NOT_ALLOWED'
    );
  });

  it('accept/edit still 404 for unknown id', () => {
    assert.throws(
      () =>
        applyOneDecisionPure({
          proposal: emptyProposal(),
          logicalId: 'ACT-99',
          decision: { action: 'accept' },
          tips: new Map(),
          userId: 'ba-1',
          organizationId: 'org-1',
          pack,
          reviewId: 'rev-1',
        }),
      (err) => err.errorCode === 'PROPOSAL_ITEM_NOT_FOUND'
    );
  });
});

describe('detectSensitiveGate1Edits create', () => {
  it('create on actors is sensitive via decision.section', () => {
    const detection = detectSensitiveGate1Edits(emptyProposal(), {
      'ACT-1': { action: 'create', section: 'actors', editedPayload: { title: 'X' } },
    });
    assert.equal(detection.hasSensitiveEdit, true);
    assert.ok(detection.sections.includes('actors'));
  });
});
