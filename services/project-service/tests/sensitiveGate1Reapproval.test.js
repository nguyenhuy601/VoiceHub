/**
 * Gate1 sensitive sections → PO re-approval (RULE-03).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SENSITIVE_GATE1_SECTIONS,
  isSensitiveGate1Section,
  decisionTouchesSensitiveSection,
  detectSensitiveGate1Edits,
  applySensitiveReapprovalState,
} = require('../src/utils/srsProposal/sensitiveGate1Sections');

const { VALID_STATUS_TRANSITIONS } = require('../src/constants/requirementLifecycle');

function sampleProposal() {
  return {
    reviewVersion: 1,
    generated: {
      functionalRequirements: {
        items: [{ logicalId: 'FR-1', id: 'FR-1', title: 'Login', status: 'EXTRACTED' }],
      },
      businessRules: {
        items: [{ logicalId: 'BR-1', id: 'BR-1', title: 'Rule', status: 'EXTRACTED' }],
      },
      glossary: {
        items: [{ logicalId: 'GL-1', id: 'GL-1', title: 'Term', status: 'EXTRACTED' }],
      },
      actors: {
        items: [{ logicalId: 'ACT-1', id: 'ACT-1', title: 'User', status: 'EXTRACTED' }],
      },
      scope: {
        items: [{ logicalId: 'SC-1', id: 'SC-1', title: 'In scope', status: 'EXTRACTED' }],
      },
    },
    review: { decisions: {} },
  };
}

describe('sensitiveGate1Sections', () => {
  it('lists FR / BR / actors / scope', () => {
    assert.deepEqual([...SENSITIVE_GATE1_SECTIONS].sort(), [
      'actors',
      'businessRules',
      'functionalRequirements',
      'scope',
    ].sort());
    assert.equal(isSensitiveGate1Section('functionalRequirements'), true);
    assert.equal(isSensitiveGate1Section('glossary'), false);
  });

  it('detects edit on FR as sensitive', () => {
    const proposal = sampleProposal();
    const { hasSensitiveEdit, sections } = detectSensitiveGate1Edits(proposal, [
      {
        logicalId: 'FR-1',
        action: 'edit',
        editedPayload: { description: 'new' },
      },
    ]);
    assert.equal(hasSensitiveEdit, true);
    assert.ok(sections.includes('functionalRequirements'));
  });

  it('ignores edit on glossary', () => {
    const proposal = sampleProposal();
    const { hasSensitiveEdit } = detectSensitiveGate1Edits(proposal, [
      {
        logicalId: 'GL-1',
        action: 'edit',
        editedPayload: { description: 'term' },
      },
    ]);
    assert.equal(hasSensitiveEdit, false);
  });

  it('detects accept+editedPayload on actors', () => {
    const proposal = sampleProposal();
    const { hasSensitiveEdit, sections } = detectSensitiveGate1Edits(proposal, {
      'ACT-1': { action: 'accept', editedPayload: { title: 'Admin' } },
    });
    assert.equal(hasSensitiveEdit, true);
    assert.ok(sections.includes('actors'));
  });

  it('applySensitiveReapprovalState: approved + sensitive → under_review + clear stamp', () => {
    const next = applySensitiveReapprovalState(
      {
        status: 'approved',
        aiAnalysis: {
          phaseRuns: { phase_what: { status: 'ready', gate1: 'approved', confirmedAt: 't' } },
        },
      },
      { hasSensitiveEdit: true, sections: ['scope'] }
    );
    assert.equal(next.clearPoStamp, true);
    assert.equal(next.allowFromApproved, true);
    assert.equal(next.status, 'under_review');
    assert.equal(next.poReapprovalRequired, true);
    assert.equal(next.aiAnalysis.phaseRuns.phase_what.gate1, 'pending_reapproval');
  });

  it('applySensitiveReapprovalState: approved + non-sensitive → no clear', () => {
    const next = applySensitiveReapprovalState(
      { status: 'approved', aiAnalysis: {} },
      { hasSensitiveEdit: false, sections: [] }
    );
    assert.equal(next.clearPoStamp, false);
    assert.equal(next.allowFromApproved, undefined);
    assert.equal(next.status, 'approved');
  });

  it('lifecycle allows approved → under_review', () => {
    assert.ok(VALID_STATUS_TRANSITIONS.approved.includes('under_review'));
    assert.ok(VALID_STATUS_TRANSITIONS.approved.includes('project_linked'));
  });

  it('decisionTouchesSensitiveSection helpers', () => {
    assert.equal(
      decisionTouchesSensitiveSection({ action: 'edit' }, 'businessRules'),
      true
    );
    assert.equal(decisionTouchesSensitiveSection({ action: 'accept' }, 'scope'), false);
    assert.equal(
      decisionTouchesSensitiveSection({ action: 'reject' }, 'functionalRequirements'),
      false
    );
  });
});
