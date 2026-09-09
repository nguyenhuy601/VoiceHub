import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareMessageIds,
  resolveOutgoingRoomReceipt,
} from './messageReceiptLabel.js';

describe('messageReceiptLabel', () => {
  it('compareMessageIds', () => {
    assert.equal(compareMessageIds('aa', 'bb'), -1);
    assert.equal(compareMessageIds('bb', 'aa'), 1);
  });

  it('resolveOutgoingRoomReceipt', () => {
    assert.equal(
      resolveOutgoingRoomReceipt({
        messageId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        excludeUserId: 'me',
        peerCursors: [{ userId: 'peer', lastReadMessageId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }],
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
