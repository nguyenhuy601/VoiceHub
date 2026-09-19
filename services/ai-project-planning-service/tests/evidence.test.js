const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const {
  createEvidence,
  _resetEvidenceSeqForTests,
} = require('../src/evidence/evidence');

describe('evidence', () => {
  before(() => {
    _resetEvidenceSeqForTests();
  });

  it('createEvidence returns §3.8 shape', () => {
    const ev = createEvidence({
      sourceType: 'employee_capacity',
      sourceId: 'EMP-102',
      snapshotId: 'SNAP-001',
      metric: 'available_capacity',
      value: 32,
      unit: 'hours',
      calculatedBy: 'EmployeeMatchingTool',
      ruleId: 'CAP-003',
    });
    assert.ok(ev.evidenceId);
    assert.equal(ev.sourceType, 'employee_capacity');
    assert.equal(ev.sourceId, 'EMP-102');
    assert.equal(ev.snapshotId, 'SNAP-001');
    assert.equal(ev.metric, 'available_capacity');
    assert.equal(ev.value, 32);
    assert.equal(ev.unit, 'hours');
    assert.equal(ev.calculatedBy, 'EmployeeMatchingTool');
    assert.equal(ev.ruleId, 'CAP-003');
    assert.ok(ev.timestamp);
  });
});
