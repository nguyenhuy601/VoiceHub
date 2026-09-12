import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { replaceOptimisticWithServer } from './dmChatHelpers.js';

describe('replaceOptimisticWithServer', () => {
  it('thay optimistic pending bằng tin server khi khớp tempId', () => {
    const prev = [
      {
        _id: 'temp-1',
        content: 'hello',
        _optimistic: true,
        _sendStatus: 'pending',
      },
    ];
    const server = { _id: 'srv-1', content: 'hello', senderId: 'u1' };
    const out = replaceOptimisticWithServer(prev, server, 'temp-1');
    assert.equal(out.length, 1);
    assert.equal(out[0]._id, 'srv-1');
    assert.equal(out[0]._sendStatus, 'sent');
  });

  it('ack trễ: gỡ optimistic đã failed cùng content (SC: hiện nhưng báo lỗi)', () => {
    const prev = [
      {
        _id: 'temp-late',
        content: '😛',
        _optimistic: true,
        _sendStatus: 'failed',
        _sendError: 'timeout',
      },
    ];
    const server = { _id: 'srv-2', content: '😛', senderId: 'u1' };
    const out = replaceOptimisticWithServer(prev, server, null);
    assert.equal(out.length, 1);
    assert.equal(out[0]._id, 'srv-2');
    assert.equal(out[0]._sendStatus, 'sent');
    assert.equal(out[0]._optimistic, undefined);
  });

  it('không xóa tin khác content', () => {
    const prev = [
      { _id: 'temp-a', content: 'a', _optimistic: true, _sendStatus: 'failed' },
      { _id: 'keep', content: 'other' },
    ];
    const server = { _id: 'srv-3', content: 'a' };
    const out = replaceOptimisticWithServer(prev, server, null);
    assert.equal(out.length, 2);
    assert.ok(out.some((m) => m._id === 'keep'));
    assert.ok(out.some((m) => m._id === 'srv-3' && m._sendStatus === 'sent'));
  });
});
