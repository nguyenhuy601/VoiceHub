/**
 * claim_grounding_check — Wave B unit tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  claimGroundingCheck,
  applyGroundingToSeedRows,
  getPhase1GroundingMode,
} = require('../src/utils/tools/evidence/claimGroundingCheck');

const spans = [
  {
    id: 'e-span-1-1',
    text: 'Student can register courses online with MFA login',
    snippet: 'Student can register courses online with MFA login',
  },
  {
    id: 'e-span-1-2',
    text: 'Unrelated warehouse inventory policy',
    snippet: 'Unrelated warehouse inventory policy',
  },
];

describe('claimGroundingCheck', () => {
  it('passes when claim tokens overlap cited span', () => {
    const r = claimGroundingCheck({
      claimText: 'Student can register courses online',
      spans,
      evidenceIds: ['e-span-1-1'],
      threshold: 0.15,
    });
    assert.equal(r.status, 'pass');
    assert.ok(r.score >= 0.15);
  });

  it('fails when claim text is alien to cited span', () => {
    const r = claimGroundingCheck({
      claimText: 'Quantum teleportation fleet scheduling',
      spans,
      evidenceIds: ['e-span-1-1'],
      threshold: 0.15,
    });
    assert.equal(r.status, 'fail');
  });

  it('drop mode removes ungrounded requirement rows', () => {
    const rows = [
      { externalId: 'M-001', level: 'Module', name: 'M' },
      {
        externalId: 'FR-001',
        level: 'Requirement',
        description: 'Student can register courses online',
        evidenceIds: ['e-span-1-1'],
      },
      {
        externalId: 'FR-002',
        level: 'Requirement',
        description: 'Quantum teleportation fleet scheduling',
        evidenceIds: ['e-span-1-1'],
      },
    ];
    const out = applyGroundingToSeedRows(rows, spans, { mode: 'drop' });
    assert.equal(out.skippedGrounding, 1);
    assert.ok(out.rows.some((r) => r.externalId === 'FR-001'));
    assert.ok(!out.rows.some((r) => r.externalId === 'FR-002'));
    assert.ok(out.rows.some((r) => r.level === 'Module'));
  });

  it('flag mode keeps ungrounded with status', () => {
    const rows = [
      {
        externalId: 'FR-002',
        level: 'Requirement',
        description: 'Quantum teleportation fleet scheduling',
        evidenceIds: ['e-span-1-1'],
      },
    ];
    const out = applyGroundingToSeedRows(rows, spans, { mode: 'flag' });
    assert.equal(out.skippedGrounding, 0);
    assert.equal(out.rows[0].groundingStatus, 'fail');
  });

  it('PHASE1_GROUNDING_MODE env', () => {
    const prev = process.env.PHASE1_GROUNDING_MODE;
    try {
      delete process.env.PHASE1_GROUNDING_MODE;
      assert.equal(getPhase1GroundingMode(), 'drop');
      process.env.PHASE1_GROUNDING_MODE = 'off';
      assert.equal(getPhase1GroundingMode(), 'off');
      process.env.PHASE1_GROUNDING_MODE = 'flag';
      assert.equal(getPhase1GroundingMode(), 'flag');
    } finally {
      if (prev === undefined) delete process.env.PHASE1_GROUNDING_MODE;
      else process.env.PHASE1_GROUNDING_MODE = prev;
    }
  });
});
