/**
 * Tải GIF/sticker từ catalog CDN → File để upload qua chatFileUpload.
 * Sticker cụm từ VN (phrase) render canvas PNG trong browser.
 * Cache trong session; prefetch có hàng đợi concurrency ≤ 2; fetch có timeout.
 */

/** @type {Map<string, Promise<File>>} */
const mediaFileCache = new Map();
const MEDIA_CACHE_MAX = 48;
const FETCH_TIMEOUT_MS = 15000;
const PREFETCH_MAX_CONCURRENT = 2;
const DEFAULT_PHRASE_EMOJI = '\uD83D\uDE0A';

let prefetchActive = 0;
/** @type {Array<() => void>} */
const prefetchWaiters = [];

function cacheKeyForItem(item) {
  if (item && item.phrase) {
    return 'phrase:' + String(item.id || item.fileName || '');
  }
  return String((item && item.url) || '').trim();
}

function rememberCache(key, promise) {
  if (!key) return promise;
  mediaFileCache.set(key, promise);
  if (mediaFileCache.size > MEDIA_CACHE_MAX) {
    const oldest = mediaFileCache.keys().next().value;
    mediaFileCache.delete(oldest);
  }
  return promise;
}

function fetchWithTimeout(url, options, timeoutMs) {
  const opts = options || {};
  const ms = timeoutMs == null ? FETCH_TIMEOUT_MS : timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, ms);
  return fetch(url, Object.assign({}, opts, { signal: controller.signal })).finally(function () {
    clearTimeout(timer);
  });
}

async function withPrefetchSlot(run) {
  if (prefetchActive >= PREFETCH_MAX_CONCURRENT) {
    await new Promise(function (resolve) {
      prefetchWaiters.push(resolve);
    });
  }
  prefetchActive += 1;
  try {
    return await run();
  } finally {
    prefetchActive -= 1;
    const next = prefetchWaiters.shift();
    if (next) next();
  }
}

/**
 * @param {{ url: string, fileName?: string, mimeType?: string, phrase?: { text: string, emoji: string, bg: string, color: string }, id?: string }} item
 * @returns {Promise<File>}
 */
export async function fetchChatMediaFile(item) {
  const key = cacheKeyForItem(item);
  if (key && mediaFileCache.has(key)) {
    return mediaFileCache.get(key);
  }

  const pending = (async function () {
    if (item && item.phrase) {
      return renderPhraseStickerFile(item);
    }

    const url = String((item && item.url) || '').trim();
    if (!url) throw new Error('Missing media url');

    if (url.startsWith('data:')) {
      const res = await fetch(url);
      const blob = await res.blob();
      const type = (item && item.mimeType) || blob.type || 'application/octet-stream';
      const name = String((item && item.fileName) || 'media.bin').trim() || 'media.bin';
      return new File([blob], name, { type: type });
    }

    const res = await fetchWithTimeout(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('Media fetch failed (' + res.status + ')');

    const blob = await res.blob();
    const type = (item && item.mimeType) || blob.type || 'application/octet-stream';
    const name = String((item && item.fileName) || 'media.bin').trim() || 'media.bin';
    return new File([blob], name, { type: type });
  })();

  return rememberCache(
    key,
    pending.catch(function (err) {
      mediaFileCache.delete(key);
      throw err;
    })
  );
}

/** Prefetch khi hover ô media — ấm cache trước khi bấm gửi (max 2 concurrent). */
export function prefetchChatMediaFile(item) {
  if (!(item && (item.url || item.phrase))) return;
  if (mediaFileCache.has(cacheKeyForItem(item))) return;
  void withPrefetchSlot(function () {
    return fetchChatMediaFile(item);
  }).catch(function () {});
}

export function getChatMediaFetchTimeoutMs() {
  return FETCH_TIMEOUT_MS;
}

/**
 * @param {{ phrase: { text: string, emoji: string, bg: string, color: string }, fileName?: string, id?: string }} item
 * @returns {Promise<File>}
 */
async function renderPhraseStickerFile(item) {
  const phrase = item.phrase;
  const text = phrase.text;
  const emoji = phrase.emoji;
  const bg = phrase.bg;
  const color = phrase.color;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const radius = 96;
  ctx.fillStyle = bg || '#1e3a5f';
  roundRect(ctx, 0, 0, size, size, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 6;
  roundRect(ctx, 28, 28, size - 56, size - 56, 80);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '140px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.fillText(emoji || DEFAULT_PHRASE_EMOJI, size / 2, size * 0.4);

  const display = String(text || '').trim();
  const fontSize = display.length <= 4 ? 56 : display.length <= 8 ? 42 : 32;
  ctx.font = '700 ' + fontSize + 'px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = color || '#f8fafc';
  ctx.fillText(display, size / 2, size * 0.68);

  const blob = await new Promise(function (resolve, reject) {
    canvas.toBlob(function (b) {
      if (b) resolve(b);
      else reject(new Error('PNG encode failed'));
    }, 'image/png');
  });
  const fallbackName = String(item.id || 'phrase') + '.png';
  const name = String(item.fileName || fallbackName).replace(/\.svg$/i, '.png');
  return new File([blob], name, { type: 'image/png' });
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
