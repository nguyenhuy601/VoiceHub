import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  upsertOrgChannelMessageInInfiniteData,
  removeOrgChannelMessageFromInfiniteData,
} from './orgChannelMessageCache.js';

const msg = (id, extra = {}) => ({ _id: id, content: `c-${id}`, createdAt: '2026-09-13T00:00:00.000Z', ...extra });

describe('orgChannelMessageCache', () => {
  it('upsert seed trang đầu khi chưa có cache', () => {
    const next = upsertOrgChannelMessageInInfiniteData(undefined, msg('a1'));
    assert.equal(next.pages.length, 1);
    assert.equal(next.pages[0].messages[0]._id, 'a1');
    assert.deepEqual(next.pageParams, [undefined]);
  });

  it('upsert append vào page 0 và không nhân bản', () => {
    const prev = {
      pages: [{ messages: [msg('a1')], nextPageToken: 'tok', hasMore: true }],
      pageParams: [undefined],
    };
    const once = upsertOrgChannelMessageInInfiniteData(prev, msg('a2', { content: 'hello' }));
    assert.equal(once.pages[0].messages.length, 2);
    assert.equal(once.pages[0].messages[1]._id, 'a2');
    assert.equal(once.pages[0].nextPageToken, 'tok');

    const twice = upsertOrgChannelMessageInInfiniteData(once, msg('a2', { content: 'hello-2' }));
    assert.equal(twice.pages[0].messages.length, 2);
    assert.equal(twice.pages[0].messages[1].content, 'hello-2');
  });

  it('remove xóa đúng id trên mọi page', () => {
    const prev = {
      pages: [
        { messages: [msg('a1'), msg('a2')] },
        { messages: [msg('a0')] },
      ],
      pageParams: [undefined, 'older'],
    };
    const next = removeOrgChannelMessageFromInfiniteData(prev, 'a2');
    assert.deepEqual(
      next.pages.map((p) => p.messages.map((m) => m._id)),
      [['a1'], ['a0']]
    );
    assert.equal(removeOrgChannelMessageFromInfiniteData(prev, ''), prev);
  });
});
