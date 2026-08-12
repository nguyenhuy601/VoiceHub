import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOARD_RAG_OPEN_WARN, boardRag } from './boardRag.js';

describe('boardRag', () => {
  it('overdue > 0 → red', () => {
    assert.deepEqual(boardRag({ overdue: 1, open: 0 }), { rag: 'red', reason: 'overdue' });
  });

  it('không trễ nhưng open >= ngưỡng → amber', () => {
    assert.deepEqual(boardRag({ overdue: 0, open: BOARD_RAG_OPEN_WARN }), {
      rag: 'amber',
      reason: 'open_load',
    });
  });

  it('không trễ, open thấp → green', () => {
    assert.deepEqual(boardRag({ overdue: 0, open: 2 }), { rag: 'green', reason: 'ok' });
  });
});
