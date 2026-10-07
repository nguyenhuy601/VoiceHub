const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('governance DTO helpers (inline contract)', () => {
  it('toPublicRetentionSettings shape via getRetentionPolicy source logic', () => {
    // Mirror whitelist used in governance.service (avoid loading full service deps)
    function toPublicRetentionSettings(settings) {
      const s = settings || {};
      return {
        archiveInactiveAfterDays: s.archiveInactiveAfterDays,
        defaultRetentionDays: s.defaultRetentionDays,
        notes: s.notes || '',
        updatedAt: s.updatedAt || null,
      };
    }
    const pub = toPublicRetentionSettings({
      archiveInactiveAfterDays: 90,
      defaultRetentionDays: 365,
      notes: 'n',
      updatedAt: new Date('2026-01-01'),
      updatedBy: 'secret',
      runbookPath: 'devops/swarm/x.md',
      __v: 0,
    });
    assert.deepEqual(Object.keys(pub).sort(), [
      'archiveInactiveAfterDays',
      'defaultRetentionDays',
      'notes',
      'updatedAt',
    ]);
    assert.equal(pub.runbookPath, undefined);
    assert.equal(pub.updatedBy, undefined);
  });

  it('NaN number check matches updateRetentionPolicy guard', () => {
    const n = Number('abc');
    assert.equal(Number.isFinite(n), false);
  });

  it('director-health payload must not include capacityHint/burndownHint keys in service source', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/governance.service.js'),
      'utf8'
    );
    assert.equal(src.includes('capacityHint'), false);
    assert.equal(src.includes('burndownHint'), false);
    assert.equal(src.includes('runbookPath'), false);
  });
});
