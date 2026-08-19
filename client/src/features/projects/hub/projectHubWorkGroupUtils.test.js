import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickExistingGroupChannelId, shouldPromptWorkGroup } from './projectHubWorkGroupUtils.js';

describe('pickExistingGroupChannelId', () => {
  it('returns null when parent has no workGroupChannelId', () => {
    assert.equal(pickExistingGroupChannelId(null), null);
    assert.equal(pickExistingGroupChannelId({}), null);
    assert.equal(pickExistingGroupChannelId({ workGroupChannelId: null }), null);
    assert.equal(pickExistingGroupChannelId({ workGroupChannelId: '' }), null);
  });

  it('returns string id when present', () => {
    assert.equal(pickExistingGroupChannelId({ workGroupChannelId: 'abc123' }), 'abc123');
  });

  it('extracts _id from object ref', () => {
    assert.equal(
      pickExistingGroupChannelId({ workGroupChannelId: { _id: 'obj123' } }),
      'obj123'
    );
  });
});

describe('shouldPromptWorkGroup', () => {
  it('returns false when group already exists', () => {
    assert.equal(shouldPromptWorkGroup({ existingCount: 5, groupChannelId: 'ch1' }), false);
  });

  it('returns false when total after create < 3', () => {
    assert.equal(shouldPromptWorkGroup({ existingCount: 0, groupChannelId: null }), false);
    assert.equal(shouldPromptWorkGroup({ existingCount: 1, groupChannelId: null }), false);
  });

  it('returns true when total after create == 3', () => {
    assert.equal(shouldPromptWorkGroup({ existingCount: 2, groupChannelId: null }), true);
  });

  it('returns true when total after create > 3', () => {
    assert.equal(shouldPromptWorkGroup({ existingCount: 5, groupChannelId: null }), true);
  });
});
