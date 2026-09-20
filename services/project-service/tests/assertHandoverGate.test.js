const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertHandoverGate } = require('../src/utils/work/assertHandoverGate');

const IDS = [
  'release_notes',
  'deployment_verified',
  'acceptance_signed_off',
  'handover_completed',
];

const allChecked = Object.fromEntries(IDS.map((id) => [id, true]));

describe('assertHandoverGate', () => {
  it('fails when release ready not confirmed', () => {
    const r = assertHandoverGate({
      releaseReadyStatus: 'none',
      uatStatus: 'pass',
      handoverChecklist: allChecked,
      checklistIds: IDS,
    });
    assert.equal(r.ok, false);
    assert.ok(r.blockers.includes('release_ready_not_confirmed'));
  });

  it('fails when uat not pass', () => {
    const r = assertHandoverGate({
      releaseReadyStatus: 'confirmed',
      uatStatus: 'fail',
      handoverChecklist: allChecked,
      checklistIds: IDS,
    });
    assert.equal(r.ok, false);
    assert.ok(r.blockers.includes('uat_not_pass'));
  });

  it('fails when checklist incomplete', () => {
    const r = assertHandoverGate({
      releaseReadyStatus: 'confirmed',
      uatStatus: 'pass',
      handoverChecklist: { release_notes: true },
      checklistIds: IDS,
    });
    assert.equal(r.ok, false);
    assert.ok(r.blockers.includes('checklist_deployment_verified'));
  });

  it('ok when all criteria met', () => {
    const r = assertHandoverGate({
      releaseReadyStatus: 'confirmed',
      uatStatus: 'pass',
      handoverChecklist: allChecked,
      checklistIds: IDS,
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.blockers, []);
  });
});
