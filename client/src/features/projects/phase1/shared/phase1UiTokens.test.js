/**
 * FE unit — DEC P1-F Tech focus kinds.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isTechFocusKind } from './phase1UiTokens.js';

describe('isTechFocusKind', () => {
  it('marks FR and UC only', () => {
    assert.equal(isTechFocusKind('FR'), true);
    assert.equal(isTechFocusKind('uc'), true);
    assert.equal(isTechFocusKind('NFR'), false);
    assert.equal(isTechFocusKind('BG'), false);
    assert.equal(isTechFocusKind(''), false);
  });
});
