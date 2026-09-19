const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFriendRequestSentNotification,
  buildFriendRequestAcceptedNotification,
  notifyFriendRequestSent,
} = require('../src/clients/notification.client');

describe('buildFriendRequestSentNotification', () => {
  it('báo người nhận với type friend_request', () => {
    const payload = buildFriendRequestSentNotification({
      recipientId: 'u2',
      requesterId: 'u1',
      requesterName: 'An',
    });
    assert.deepEqual(payload, {
      userIds: ['u2'],
      type: 'friend_request',
      title: 'New Friend Request',
      content: 'An sent you a friend request',
      data: { userId: 'u1', userName: 'An' },
      actionUrl: '/friends/requests',
    });
  });

  it('fallback Someone khi thiếu tên người gửi', () => {
    const payload = buildFriendRequestSentNotification({ recipientId: 'u2', requesterId: 'u1' });
    assert.equal(payload.content, 'Someone sent you a friend request');
    assert.equal(payload.data.userName, 'Someone');
  });

  it('trả null khi thiếu người nhận', () => {
    assert.equal(buildFriendRequestSentNotification({ requesterId: 'u1' }), null);
  });
});

describe('buildFriendRequestAcceptedNotification', () => {
  it('báo người gửi lời mời, actionUrl trỏ counterpart', () => {
    const payload = buildFriendRequestAcceptedNotification({
      recipientId: 'u1',
      counterpartId: 'u2',
      counterpartName: 'Bình',
    });
    assert.deepEqual(payload, {
      userIds: ['u1'],
      type: 'friend_accepted',
      title: 'Friend Request Accepted',
      content: 'Bình has accepted your friend request',
      data: { friendId: 'u2', friendName: 'Bình' },
      actionUrl: '/friends/u2',
    });
  });

  it('trả null khi thiếu counterpart', () => {
    assert.equal(buildFriendRequestAcceptedNotification({ recipientId: 'u1' }), null);
  });
});

describe('notifyFriendRequestSent', () => {
  it('trả false thay vì throw khi chưa cấu hình notification-service', async () => {
    const sent = await notifyFriendRequestSent({
      recipientId: 'u2',
      requesterId: 'u1',
      requesterName: 'An',
    });
    assert.equal(sent, false);
  });
});
