import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldPlaceToolbarBelowBubble,
  shouldPlaceEmojiPanelBelow,
} from './messageToolbarPlacement.js';

describe('messageToolbarPlacement (no DOM)', () => {
  it('null-safe', () => {
    assert.equal(shouldPlaceToolbarBelowBubble(null), false);
    assert.equal(shouldPlaceEmojiPanelBelow(null), false);
  });
});
