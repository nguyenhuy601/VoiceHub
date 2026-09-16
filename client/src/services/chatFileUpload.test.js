import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_UPLOAD_DEFAULT_TIMEOUT_MS,
  createUploadTimeoutError,
} from '../services/chatFileUpload.js';

describe('chatFileUpload timeout helpers', () => {
  it('default timeout trong khoảng 20–60s (SC-P0-03)', () => {
    assert.ok(CHAT_UPLOAD_DEFAULT_TIMEOUT_MS >= 20_000);
    assert.ok(CHAT_UPLOAD_DEFAULT_TIMEOUT_MS <= 60_000);
  });

  it('createUploadTimeoutError có code UPLOAD_TIMEOUT', () => {
    const err = createUploadTimeoutError();
    assert.equal(err.code, 'UPLOAD_TIMEOUT');
    assert.equal(err.name, 'AbortError');
  });
});
