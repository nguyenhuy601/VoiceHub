import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_GIF_ITEMS,
  CHAT_STICKER_ITEMS,
  filterChatMediaItems,
} from './chatGifStickerCatalog.js';
import { CHAT_PHRASE_STICKER_ITEMS } from './chatDailyPhraseStickers.js';

describe('chatGifStickerCatalog', () => {
  it('có catalog gif và sticker đủ lớn', () => {
    assert.ok(CHAT_GIF_ITEMS.length >= 70);
    assert.ok(CHAT_STICKER_ITEMS.length >= 180);
    assert.ok(CHAT_PHRASE_STICKER_ITEMS.length >= 30);
    const urls = new Set(CHAT_GIF_ITEMS.map((item) => item.url));
    assert.equal(urls.size, CHAT_GIF_ITEMS.length);
    assert.ok(CHAT_GIF_ITEMS.every((item) => item.url.includes('fonts.gstatic.com')));
  });

  it('filterChatMediaItems tìm nhiều sticker cho "cảm ơn"', () => {
    const out = filterChatMediaItems(CHAT_STICKER_ITEMS, 'cảm ơn');
    assert.ok(out.length >= 10, `expected >=10, got ${out.length}`);
  });

  it('filterChatMediaItems tìm nhiều gif cho "cảm ơn"', () => {
    const out = filterChatMediaItems(CHAT_GIF_ITEMS, 'cảm ơn');
    assert.ok(out.length >= 10, `expected >=10, got ${out.length}`);
    assert.ok(out.some((item) => item.id === 'gif-thanks'));
  });

  it('filterChatMediaItems tìm được "xin lỗi" trên gif và sticker', () => {
    const gifs = filterChatMediaItems(CHAT_GIF_ITEMS, 'xin lỗi');
    const stickers = filterChatMediaItems(CHAT_STICKER_ITEMS, 'xin lỗi');
    assert.ok(gifs.length >= 3, `gif xin lỗi expected >=3, got ${gifs.length}`);
    assert.ok(stickers.length >= 3, `sticker xin lỗi expected >=3, got ${stickers.length}`);
    assert.ok(stickers.some((item) => item.id.includes('xin-loi')));
  });

  it('filterChatMediaItems cụm từ hằng ngày (dạ, tạm biệt, giúp)', () => {
    assert.ok(filterChatMediaItems(CHAT_STICKER_ITEMS, 'dạ').length >= 1);
    assert.ok(filterChatMediaItems(CHAT_STICKER_ITEMS, 'tạm biệt').length >= 1);
    assert.ok(filterChatMediaItems(CHAT_STICKER_ITEMS, 'giúp').length >= 1);
    assert.ok(filterChatMediaItems(CHAT_STICKER_ITEMS, 'ngủ ngon').length >= 1);
  });

  it('filterChatMediaItems không dấu vẫn khớp', () => {
    const out = filterChatMediaItems(CHAT_GIF_ITEMS, 'cam on');
    assert.ok(out.some((item) => item.id === 'gif-thanks'));
    assert.ok(filterChatMediaItems(CHAT_GIF_ITEMS, 'xin loi').length >= 3);
  });

  it('filterChatMediaItems trả rỗng khi không khớp', () => {
    assert.equal(filterChatMediaItems(CHAT_STICKER_ITEMS, 'xyznotfound').length, 0);
  });
});
