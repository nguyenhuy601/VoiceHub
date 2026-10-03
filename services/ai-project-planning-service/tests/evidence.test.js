const { describe, it, before, after } = require('node:test');
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

  it('rejects unknown metric when G1_METRIC_ENFORCE on', () => {
    const prev = process.env.G1_METRIC_ENFORCE;
    process.env.G1_METRIC_ENFORCE = '1';
    try {
      assert.throws(
        () =>
          createEvidence({
            sourceType: 'test',
            sourceId: 'x',
            metric: 'totally_invented_metric',
            value: 1,
          }),
        (err) => err && err.code === 'G1_CATALOG_MISS'
      );
    } finally {
      if (prev === undefined) delete process.env.G1_METRIC_ENFORCE;
      else process.env.G1_METRIC_ENFORCE = prev;
    }
  });

  it('allows unknown metric when G1_METRIC_ENFORCE=0', () => {
    const prev = process.env.G1_METRIC_ENFORCE;
    process.env.G1_METRIC_ENFORCE = '0';
    try {
      const ev = createEvidence({
        sourceType: 'test',
        sourceId: 'x',
        metric: 'totally_invented_metric',
        value: 1,
      });
      assert.equal(ev.metric, 'totally_invented_metric');
    } finally {
      if (prev === undefined) delete process.env.G1_METRIC_ENFORCE;
      else process.env.G1_METRIC_ENFORCE = prev;
    }
  });

  it('allows null metric without catalog check', () => {
    const ev = createEvidence({
      sourceType: 'note',
      sourceId: 'n1',
      value: 'ok',
    });
    assert.equal(ev.metric, null);
  });

  it('assertToolOutputHasEvidence rejects empty evidence even with confidence', () => {
    const { assertToolOutputHasEvidence } = require('../src/evidence/evidence');
    const prev = process.env.EVIDENCE_ENFORCE;
    process.env.EVIDENCE_ENFORCE = '1';
    try {
      assert.throws(
        () =>
          assertToolOutputHasEvidence('MatchingTool', {
            confidence: 0.99,
            evidence: [],
          }),
        (err) => err && err.code === 'EVIDENCE_REQUIRED'
      );
    } finally {
      if (prev === undefined) delete process.env.EVIDENCE_ENFORCE;
      else process.env.EVIDENCE_ENFORCE = prev;
    }
  });

  it('assertToolOutputHasEvidence accepts non-empty evidence', () => {
    const { assertToolOutputHasEvidence } = require('../src/evidence/evidence');
    const prev = process.env.EVIDENCE_ENFORCE;
    process.env.EVIDENCE_ENFORCE = '1';
    try {
      const ok = assertToolOutputHasEvidence('MatchingTool', {
        evidence: [{ evidenceId: 'EV-1' }],
      });
      assert.equal(ok.ok, true);
    } finally {
      if (prev === undefined) delete process.env.EVIDENCE_ENFORCE;
      else process.env.EVIDENCE_ENFORCE = prev;
    }
  });
});
