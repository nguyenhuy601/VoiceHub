const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeTraceGaps } = require('../src/utils/analysis/traceGaps');

describe('summarizeTraceGaps', () => {
  it('flags FR requirement missing UC / CR; ignores Module level for CR gap', () => {
    const artifacts = [
      {
        _id: 'fr1',
        kind: 'FR',
        externalKey: 'FR-001',
        title: 'Req',
        structured: { level: 'Requirement', customerRequirementIds: [] },
      },
      {
        _id: 'frm',
        kind: 'FR',
        externalKey: 'FR-M01',
        title: 'Mod',
        structured: { level: 'Module', customerRequirementIds: [] },
      },
      {
        _id: 'uc1',
        kind: 'UC',
        externalKey: 'UC-001',
        structured: { relatedFrKeys: [] },
      },
    ];
    const gaps = summarizeTraceGaps({ artifacts, links: [] });
    assert.equal(gaps.frMissingUc.length, 1);
    assert.equal(gaps.frMissingUc[0].externalKey, 'FR-001');
    assert.equal(gaps.frMissingCr.length, 1);
    assert.equal(gaps.frMissingCr[0].externalKey, 'FR-001');
  });

  it('covers BR via soft relatedBgKey and BPM via relatedBrKey', () => {
    const artifacts = [
      { _id: 'bg1', kind: 'BG', externalKey: 'BG-001', title: 'G' },
      {
        _id: 'br1',
        kind: 'BR',
        externalKey: 'BR-001',
        title: 'R',
        structured: { relatedBgKey: 'BG-001' },
      },
      {
        _id: 'br2',
        kind: 'BR',
        externalKey: 'BR-002',
        title: 'R2',
        structured: {},
      },
      {
        _id: 'bpm1',
        kind: 'BPM',
        externalKey: 'BPM-001-S1',
        title: 'P',
        structured: { relatedBrKey: 'BR-001' },
      },
      {
        _id: 'bpm2',
        kind: 'BPM',
        externalKey: 'BPM-002-S1',
        title: 'P2',
        structured: {},
      },
    ];
    const gaps = summarizeTraceGaps({ artifacts, links: [] });
    assert.equal(gaps.brMissingBg.length, 1);
    assert.equal(gaps.brMissingBg[0].externalKey, 'BR-002');
    assert.equal(gaps.bpmMissingBr.length, 1);
    assert.equal(gaps.bpmMissingBr[0].externalKey, 'BPM-002-S1');
  });

  it('UC implements link covers FR for frMissingUc', () => {
    const artifacts = [
      {
        _id: 'fr1',
        kind: 'FR',
        externalKey: 'FR-001',
        title: 'Req',
        structured: { level: 'Requirement', customerRequirementIds: ['CR-001'] },
      },
      { _id: 'uc1', kind: 'UC', externalKey: 'UC-001', structured: {} },
    ];
    const gaps = summarizeTraceGaps({
      artifacts,
      links: [{ linkType: 'implements', fromArtifactId: 'uc1', toArtifactId: 'fr1' }],
    });
    assert.equal(gaps.frMissingUc.length, 0);
    assert.equal(gaps.frMissingCr.length, 0);
  });
});
