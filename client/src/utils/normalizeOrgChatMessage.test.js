import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOrgChatMessage,
  normalizeOrgChatMessages,
} from './normalizeOrgChatMessage.js';

describe('normalizeOrgChatMessage — file after F5', () => {
  it('giữ messageType file khi đã có', () => {
    const row = normalizeOrgChatMessage({
      content: 'demo.md',
      messageType: 'file',
      fileMeta: {
        storagePath: 'temp/u1/x_demo.md',
        originalName: 'demo.md',
        mimeType: 'text/markdown',
        byteSize: 100,
      },
    });
    assert.equal(row.messageType, 'file');
    assert.equal(row.fileMeta.storagePath, 'temp/u1/x_demo.md');
  });

  it('nâng text → file khi có fileMeta (API cũ strip storagePath)', () => {
    const row = normalizeOrgChatMessage({
      content: 'demo.md',
      messageType: 'text',
      fileMeta: {
        originalName: 'demo.md',
        mimeType: 'text/markdown',
        byteSize: 14500,
      },
    });
    assert.equal(row.messageType, 'file');
  });

  it('normalizeOrgChatMessages map list', () => {
    const list = normalizeOrgChatMessages([
      { content: 'hi', messageType: 'text' },
      {
        content: 'a.md',
        messageType: 'file',
        fileMeta: { originalName: 'a.md', byteSize: 1 },
      },
    ]);
    assert.equal(list[0].messageType, 'text');
    assert.equal(list[1].messageType, 'file');
  });
});
