import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGate1DisplayIds } from './gate1DisplayIds.js';

function getRowId(row) {
  return String(row?.logicalId || row?.id || '').trim();
}

describe('resolveGate1DisplayIds', () => {
  it('keeps sequential ids when nothing rejected', () => {
    const rows = [
      { logicalId: 'BPM-1' },
      { logicalId: 'BPM-2' },
      { logicalId: 'BPM-3' },
    ];
    assert.deepEqual(resolveGate1DisplayIds(rows, {}, getRowId), [
      'BPM-1',
      'BPM-2',
      'BPM-3',
    ]);
  });

  it('compacts ids after a rejected middle row', () => {
    const rows = [
      { logicalId: 'BPM-1' },
      { logicalId: 'BPM-2' },
      { logicalId: 'BPM-3' },
      { logicalId: 'BPM-4' },
      { logicalId: 'BPM-5' },
    ];
    const decisions = { 'BPM-2': { action: 'reject' } };
    assert.deepEqual(resolveGate1DisplayIds(rows, decisions, getRowId), [
      'BPM-1',
      'BPM-2', // rejected keeps original
      'BPM-2', // former BPM-3
      'BPM-3',
      'BPM-4',
    ]);
  });

  it('compacts after rejecting the first row', () => {
    const rows = [{ logicalId: 'FR-1' }, { logicalId: 'FR-2' }, { logicalId: 'FR-3' }];
    const decisions = { 'FR-1': { action: 'reject' } };
    assert.deepEqual(resolveGate1DisplayIds(rows, decisions, getRowId), [
      'FR-1',
      'FR-1',
      'FR-2',
    ]);
  });

  it('leaves slug ids unchanged and still compacts PREFIX-n', () => {
    const rows = [
      { logicalId: 'user' },
      { logicalId: 'ACT-1' },
      { logicalId: 'ACT-2' },
      { logicalId: 'system' },
    ];
    const decisions = { 'ACT-1': { action: 'reject' } };
    assert.deepEqual(resolveGate1DisplayIds(rows, decisions, getRowId), [
      'user',
      'ACT-1',
      'ACT-1',
      'system',
    ]);
  });

  it('preserves original gaps when nothing is rejected', () => {
    const rows = [{ logicalId: 'BPM-1' }, { logicalId: 'BPM-3' }, { logicalId: 'BPM-5' }];
    assert.deepEqual(resolveGate1DisplayIds(rows, {}, getRowId), [
      'BPM-1',
      'BPM-3',
      'BPM-5',
    ]);
  });

  it('compacts after reject even when originals had gaps', () => {
    const rows = [{ logicalId: 'BPM-1' }, { logicalId: 'BPM-3' }, { logicalId: 'BPM-5' }];
    const decisions = { 'BPM-3': { action: 'reject' } };
    assert.deepEqual(resolveGate1DisplayIds(rows, decisions, getRowId), [
      'BPM-1',
      'BPM-3',
      'BPM-2',
    ]);
  });
});
