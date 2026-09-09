import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  shouldFullInvalidateAfterCardMutation,
  overviewKeysTouchedByMove,
  resolveCardMutationCachePolicy,
} from './projectHubMutationCachePolicy.js';

describe('projectHubMutationCachePolicy', () => {
  it('update does not full-invalidate; move does not full-invalidate', () => {
    assert.equal(shouldFullInvalidateAfterCardMutation(), false);
    assert.equal(resolveCardMutationCachePolicy('update').fullInvalidate, false);
    assert.equal(resolveCardMutationCachePolicy('move').fullInvalidate, false);
  });

  it('move invalidates overview only; update does not', () => {
    assert.equal(overviewKeysTouchedByMove(), true);
    assert.equal(resolveCardMutationCachePolicy('move').overviewInvalidate, true);
    assert.equal(resolveCardMutationCachePolicy('update').overviewInvalidate, false);
  });
});
