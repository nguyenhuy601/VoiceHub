const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  compareMessageIds,
  isMessageSeenByCursor,
  shouldAdvanceCursor,
  resolveOutgoingRoomReceipt,
} = require('../src/utils/roomReadCursorLogic');

describe('compareMessageIds', () => {
  it('so sánh hex ObjectId theo thứ tự thời gian', () => {
    assert.equal(compareMessageIds('aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'), -1);
    assert.equal(compareMessageIds('bbbbbbbbbbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaaaaaaaaaaaa'), 1);
    assert.equal(compareMessageIds('aaaaaaaaaaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaaaaaaaaaa'), 0);
  });
});

describe('shouldAdvanceCursor', () => {
  it('advance khi candidate mới hơn; không tụt lùi', () => {
    assert.equal(shouldAdvanceCursor('', 'aaaaaaaaaaaaaaaaaaaaaaaa'), true);
    assert.equal(
      shouldAdvanceCursor('aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'),
      true
    );
    assert.equal(
      shouldAdvanceCursor('bbbbbbbbbbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaaaaaaaaaaaa'),
      false
    );
    assert.equal(
      shouldAdvanceCursor('aaaaaaaaaaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaaaaaaaaaa'),
      false
    );
  });
});

describe('isMessageSeenByCursor / resolveOutgoingRoomReceipt', () => {
  it('seen khi peer cursor >= message', () => {
    assert.equal(
      isMessageSeenByCursor('aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'),
      true
    );
    assert.equal(
      isMessageSeenByCursor('bbbbbbbbbbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaaaaaaaaaaaa'),
      false
    );
    assert.equal(
      resolveOutgoingRoomReceipt({
        messageId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        excludeUserId: 'me',
        peerCursors: [
          { userId: 'me', lastReadMessageId: 'ffffffffffffffffffffffff' },
          { userId: 'peer', lastReadMessageId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
        ],
      }),
      'seen'
    );
    assert.equal(
      resolveOutgoingRoomReceipt({
        messageId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        excludeUserId: 'me',
        peerCursors: [{ userId: 'peer', lastReadMessageId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }],
      }),
      'sent'
    );
  });
});
