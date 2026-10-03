const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertHandoverChecklistAuthz,
  assertDeployVerifiedEvidence,
  buildChecklistMetaPatch,
} = require('../src/utils/work/handoverChecklistPolicy');

describe('handoverChecklistAuthz', () => {
  it('allows PM to tick release_notes', () => {
    const r = assertHandoverChecklistAuthz({
      prevChecklist: {},
      nextChecklist: { release_notes: true },
      canPhase: true,
      canAccept: false,
    });
    assert.equal(r.ok, true);
  });

  it('forbids PM ticking acceptance_signed_off', () => {
    const r = assertHandoverChecklistAuthz({
      prevChecklist: {},
      nextChecklist: { acceptance_signed_off: true },
      canPhase: true,
      canAccept: false,
    });
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 403);
    assert.equal(r.errorCode, 'HANDOVER_ACCEPT_FORBIDDEN');
  });

  it('allows PO ticking acceptance and handover_completed', () => {
    const r = assertHandoverChecklistAuthz({
      prevChecklist: { acceptance_signed_off: true },
      nextChecklist: { acceptance_signed_off: true, handover_completed: true },
      canPhase: false,
      canAccept: true,
    });
    assert.equal(r.ok, true);
  });

  it('forbids PO ticking deployment_verified without phase perm', () => {
    const r = assertHandoverChecklistAuthz({
      prevChecklist: {},
      nextChecklist: { deployment_verified: true },
      canPhase: false,
      canAccept: true,
    });
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'HANDOVER_CHECKLIST_FORBIDDEN');
  });

  it('PM with phase perm still cannot tick PO acceptance items', () => {
    const r = assertHandoverChecklistAuthz({
      prevChecklist: {},
      nextChecklist: { acceptance_signed_off: true, handover_completed: true },
      canPhase: true,
      canAccept: false,
    });
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'HANDOVER_ACCEPT_FORBIDDEN');
  });
});

describe('assertDeployVerifiedEvidence', () => {
  it('requires https url when turning verified on', () => {
    const r = assertDeployVerifiedEvidence({
      prevChecklist: {},
      nextChecklist: { deployment_verified: true },
      deployEvidence: { pipelineUrl: '' },
    });
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'DEPLOY_VERIFY_NEED_EVIDENCE_URL');
  });

  it('ok with https url', () => {
    const r = assertDeployVerifiedEvidence({
      prevChecklist: {},
      nextChecklist: { deployment_verified: true },
      deployEvidence: { pipelineUrl: 'https://ci.example/job/1' },
    });
    assert.equal(r.ok, true);
  });

  it('skips when not turning on', () => {
    const r = assertDeployVerifiedEvidence({
      prevChecklist: { deployment_verified: true },
      nextChecklist: { deployment_verified: true },
      deployEvidence: { pipelineUrl: '' },
    });
    assert.equal(r.ok, true);
  });
});

describe('buildChecklistMetaPatch', () => {
  it('stamps changed ids', () => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    const meta = buildChecklistMetaPatch({
      prevChecklist: {},
      nextChecklist: { release_notes: true },
      prevMeta: {},
      userId: 'u1',
      now: at,
    });
    assert.equal(meta.release_notes.byUserId, 'u1');
    assert.equal(String(meta.release_notes.at), String(at));
  });
});
