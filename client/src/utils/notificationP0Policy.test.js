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

  it('system không kind (legacy) vẫn P0', () => {
    assert.equal(isP0Notification({ rawType: 'system' }), true);
  });

  it('system kind allowlist là P0; watcher / CR work thì không', () => {
    assert.equal(
      isP0Notification({ rawType: 'system', data: { kind: 'task_due_soon' } }),
      true
    );
    assert.equal(
      isP0Notification({ rawType: 'system', data: { kind: 'project_approval' } }),
      true
    );
    assert.equal(
      isP0Notification({ rawType: 'system', data: { kind: 'project_member_added' } }),
      true
    );
    assert.equal(
      isP0Notification({ rawType: 'system', data: { kind: 'ai_proposal_pending' } }),
      true
    );
    assert.equal(
      isP0Notification({ rawType: 'system', data: { kind: 'task_board_list' } }),
      false
    );
    assert.equal(
      isP0Notification({ rawType: 'system', data: { kind: 'change_request_work' } }),
      false
    );
  });

  it('friend / message DM thường không P0; project_mention là P0', () => {
    assert.equal(isP0Notification({ rawType: 'friend_request' }), false);
    assert.equal(isP0Notification({ type: 'friend' }), false);
    assert.equal(isP0Notification({ rawType: 'message' }), false);
    assert.equal(
      isP0Notification({ rawType: 'message', data: { kind: 'project_mention' } }),
      true
    );
  });

  it('capability/HR qua data.kind', () => {
    assert.equal(isP0Notification({ data: { kind: 'capability_verified' } }), true);
    assert.equal(isP0Notification({ data: { kind: 'hr_leave' } }), true);
  });
});

describe('mapNotificationUiType', () => {
  it('map hạn → deadline để lọc chip', () => {
    assert.equal(mapNotificationUiType('system', 'task_due_soon'), 'deadline');
    assert.equal(mapNotificationUiType('system', 'task_overdue'), 'deadline');
    assert.equal(mapNotificationUiType('task_assigned', ''), 'task');
  });

  it('message: DM → message; mention kênh → mention', () => {
    assert.equal(mapNotificationUiType('message', ''), 'message');
    assert.equal(mapNotificationUiType('message', 'project_mention'), 'mention');
  });
});
