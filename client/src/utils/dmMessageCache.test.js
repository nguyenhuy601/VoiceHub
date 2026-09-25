import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDmConversationCache,
  dmListMatchesPeer,
  isTransientDmMessage,
  persistableDmMessages,
} from './dmMessageCache.js';

const msg = (id, extra = {}) => ({ _id: id, content: `c-${id}`, ...extra });

describe('dmMessageCache', () => {
  it('isTransientDmMessage loại temp và optimistic', () => {
    assert.equal(isTransientDmMessage(msg('a1')), false);
    assert.equal(isTransientDmMessage(msg('temp-1')), true);
    assert.equal(isTransientDmMessage(msg('a2', { _optimistic: true })), true);
    assert.equal(isTransientDmMessage({}), true);
  });

  it('persistableDmMessages bỏ tin tạm', () => {
    const list = persistableDmMessages([
      msg('temp-9'),
      msg('a1'),
      msg('a2', { _optimistic: true }),
    ]);
    assert.deepEqual(
      list.map((m) => m._id),
      ['a1']
    );
  });

  it('applyDmConversationCache seed khi chưa có cache và giữ pageToken khi đã có', () => {
    const seeded = applyDmConversationCache(undefined, [msg('a1'), msg('temp-x')]);
    assert.deepEqual(
      seeded.arr.map((m) => m._id),
      ['a1']
    );
    assert.equal(seeded.totalPages, 1);

    const prev = {
      arr: [msg('old')],
      totalPages: 3,
      currentPage: 1,
      nextPageToken: 'tok',
      hasMore: true,
    };
    const next = applyDmConversationCache(prev, [msg('a1'), msg('a2')]);
    assert.equal(next.nextPageToken, 'tok');
    assert.equal(next.hasMore, true);
    assert.deepEqual(
      next.arr.map((m) => m._id),
      ['a1', 'a2']
    );
  });

  it('dmListMatchesPeer không nhận list của bạn khác', () => {
    const row = { _id: 'm1', senderId: 'me', receiverId: 'jay' };
    assert.equal(dmListMatchesPeer([row], 'jay'), true);
    assert.equal(dmListMatchesPeer([row], 'other'), false);
    assert.equal(dmListMatchesPeer([], 'jay'), true);
  });
});
