import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isP0Notification } from './notificationP0Policy.js';

describe('isP0Notification', () => {
  it('task / system / document là P0', () => {
    assert.equal(isP0Notification({ rawType: 'task_assigned' }), true);
    assert.equal(isP0Notification({ type: 'task' }), true);
    assert.equal(isP0Notification({ rawType: 'system' }), true);
    assert.equal(isP0Notification({ rawType: 'document' }), true);
  });

  it('friend / message thường không P0', () => {
    assert.equal(isP0Notification({ rawType: 'friend_request' }), false);
    assert.equal(isP0Notification({ type: 'friend' }), false);
    assert.equal(isP0Notification({ rawType: 'message' }), false);
  });

  it('capability/HR qua data.kind', () => {
    assert.equal(isP0Notification({ data: { kind: 'capability_verified' } }), true);
  });
});
