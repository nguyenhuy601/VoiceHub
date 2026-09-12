import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getChatMediaFetchTimeoutMs } from './chatGifStickerSend.js';

describe('chatGifStickerSend', () => {
  it('fetch timeout cấu hình ≤ 20s (SC-P0-03)', () => {
    const ms = getChatMediaFetchTimeoutMs();
    assert.ok(Number.isFinite(ms));
    assert.ok(ms > 0 && ms <= 20_000);
  });
});
