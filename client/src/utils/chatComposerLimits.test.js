import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_MESSAGE_MAX_LENGTH, resolveMentionNavIndex } from './chatComposerLimits.js';

describe('resolveMentionNavIndex', () => {
  it('ArrowDown ở cuối quay về 0', () => {
    assert.equal(resolveMentionNavIndex(2, 'ArrowDown', 3), 0);
    assert.equal(resolveMentionNavIndex(0, 'ArrowDown', 3), 1);
  });

  it('ArrowUp ở đầu nhảy về cuối', () => {
    assert.equal(resolveMentionNavIndex(0, 'ArrowUp', 3), 2);
    assert.equal(resolveMentionNavIndex(2, 'ArrowUp', 3), 1);
  });

  it('Home/End', () => {
    assert.equal(resolveMentionNavIndex(1, 'Home', 4), 0);
    assert.equal(resolveMentionNavIndex(1, 'End', 4), 3);
  });

  it('danh sách rỗng → -1', () => {
    assert.equal(resolveMentionNavIndex(0, 'ArrowDown', 0), -1);
  });

  it('phím khác giữ nguyên, index ngoài phạm vi kẹp về 0', () => {
    assert.equal(resolveMentionNavIndex(1, 'a', 3), 1);
    assert.equal(resolveMentionNavIndex(7, 'x', 3), 0);
  });
});

describe('CHAT_MESSAGE_MAX_LENGTH', () => {
  it('khớp giới hạn chat-service', () => {
    assert.equal(CHAT_MESSAGE_MAX_LENGTH, 20000);
  });
});
