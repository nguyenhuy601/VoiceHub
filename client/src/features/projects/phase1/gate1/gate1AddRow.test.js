import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextGate1LogicalId,
  buildGate1AddedRow,
  mergeGate1SectionRows,
  isGate1CreateDecisionReady,
  isGate1SectionAddable,
} from './gate1AddRow.js';

describe('nextGate1LogicalId', () => {
  it('starts at ACT-1 when section empty', () => {
    assert.equal(nextGate1LogicalId('actors', []), 'ACT-1');
  });

  it('increments past ACT-n and ignores slug ids', () => {
    const rows = [
      { logicalId: 'user' },
      { logicalId: 'system' },
      { logicalId: 'ACT-2' },
    ];
    assert.equal(nextGate1LogicalId('actors', rows), 'ACT-3');
  });

  it('avoids collision when ACT-1 already taken via non-prefix gap', () => {
    const rows = [{ logicalId: 'ACT-1' }, { logicalId: 'ACT-1-dup' }];
    assert.equal(nextGate1LogicalId('actors', rows), 'ACT-2');
  });
});

describe('buildGate1AddedRow / merge', () => {
  it('stamps BA_ADDED provenance', () => {
    const row = buildGate1AddedRow({ section: 'actors', logicalId: 'ACT-1' });
    assert.equal(row.provenance.type, 'BA_ADDED');
    assert.equal(row.addedLocally, true);
  });

  it('merges local actors without duplicating server ids', () => {
    const merged = mergeGate1SectionRows(
      [{ logicalId: 'user', title: 'Người dùng' }],
      [
        buildGate1AddedRow({ section: 'actors', logicalId: 'ACT-1' }),
        buildGate1AddedRow({ section: 'actors', logicalId: 'user' }),
      ],
      'actors'
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[1].logicalId, 'ACT-1');
  });
});

describe('isGate1CreateDecisionReady', () => {
  it('requires title for create', () => {
    assert.equal(isGate1CreateDecisionReady({ action: 'create', editedPayload: {} }), false);
    assert.equal(
      isGate1CreateDecisionReady({ action: 'create', editedPayload: { title: 'Admin' } }),
      true
    );
    assert.equal(isGate1CreateDecisionReady({ action: 'accept' }), true);
  });
});

describe('isGate1SectionAddable', () => {
  it('covers Gate1 review sections including useCases', () => {
    assert.equal(isGate1SectionAddable('actors'), true);
    assert.equal(isGate1SectionAddable('useCases'), true);
    assert.equal(isGate1SectionAddable('functionalRequirements'), true);
    assert.equal(isGate1SectionAddable('unknownSection'), false);
  });
});
