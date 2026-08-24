/**
 * Tải GIF/sticker từ catalog CDN → File để upload qua chatFileUpload.
 * Sticker cụm từ VN (phrase) render canvas PNG trong browser.
 * @param {{ url: string, fileName?: string, mimeType?: string, phrase?: { text: string, emoji: string, bg: string, color: string } }} item
 * @returns {Promise<File>}
 */
export async function fetchChatMediaFile(item) {
  if (item?.phrase) {
    return renderPhraseStickerFile(item);
  }

  const url = String(item?.url || '').trim();
  if (!url) throw new Error('Missing media url');

  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`Media fetch failed (${res.status})`);

  const blob = await res.blob();
  const type = item.mimeType || blob.type || 'application/octet-stream';
  const name = String(item.fileName || 'media.bin').trim() || 'media.bin';
  return new File([blob], name, { type });
}

/**
 * @param {{ phrase: { text: string, emoji: string, bg: string, color: string }, fileName?: string, id?: string }} item
 * @returns {Promise<File>}
 */
async function renderPhraseStickerFile(item) {
  const { text, emoji, bg, color } = item.phrase;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Nền bo góc
  const radius = 96;
  ctx.fillStyle = bg || '#1e3a5f';
  roundRect(ctx, 0, 0, size, size, radius);
  ctx.fill();

  // Viền nhẹ
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 6;
  roundRect(ctx, 28, 28, size - 56, size - 56, 80);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '140px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.fillText(emoji || '😊', size / 2, size * 0.4);

  const display = String(text || '').trim();
  const fontSize = display.length <= 4 ? 56 : display.length <= 8 ? 42 : 32;
  ctx.font = `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = color || '#f8fafc';
  ctx.fillText(display, size / 2, size * 0.68);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png');
  });
  const name = String(item.fileName || `${item.id || 'phrase'}.png`).replace(/\.svg$/i, '.png');
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
