import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gatePreviewSeedKey } from './gatePreviewSeedKey.js';

describe('gatePreviewSeedKey', () => {
  it('empty for null/undefined', () => {
    assert.equal(gatePreviewSeedKey(null), '');
    assert.equal(gatePreviewSeedKey(undefined), '');
  });

  it('same totals → same key across new object refs', () => {
    const a = { rowTotal: 54, frCount: 54, candidateCount: 36, duplicateCount: 0, skippedCount: 18 };
    const b = { ...a, quality: { missingActor: 6 }, rows: [{ frId: 'CR-001' }] };
    assert.equal(gatePreviewSeedKey(a), gatePreviewSeedKey(b));
  });

  it('different frCount → different key', () => {
    const a = { rowTotal: 54, frCount: 54, candidateCount: 36, duplicateCount: 0, skippedCount: 18 };
    const b = { ...a, frCount: 55 };
    assert.notEqual(gatePreviewSeedKey(a), gatePreviewSeedKey(b));
  });
});
