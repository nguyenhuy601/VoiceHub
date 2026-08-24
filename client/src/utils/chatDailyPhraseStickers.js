/**
 * Sticker cụm từ tiếng Việt thường ngày (kiểu Zalo: chữ + cảm xúc).
 * Không dùng asset bản quyền; render SVG preview + PNG khi gửi.
 */

/** @typedef {{ id: string, label: string, tags: string[], url: string, fileName: string, mimeType: string, phrase?: { text: string, emoji: string, bg: string, color: string } }} ChatMediaItem */

/**
 * @param {string} id
 * @param {string} text chữ trên sticker
 * @param {string[]} tags
 * @param {{ emoji?: string, bg?: string, color?: string, label?: string }} [opts]
 * @returns {ChatMediaItem}
 */
export function phraseSticker(id, text, tags, opts = {}) {
  const emoji = opts.emoji || '😊';
  const bg = opts.bg || '#1e3a5f';
  const color = opts.color || '#f8fafc';
  const label = opts.label || text;
  const svg = buildPhraseSvg({ text, emoji, bg, color });
  return {
    id: `stk-phrase-${id}`,
    label,
    tags: Array.from(new Set([text.toLowerCase(), ...tags])),
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    fileName: `${id}.png`,
    mimeType: 'image/png',
    phrase: { text, emoji, bg, color },
  };
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPhraseSvg({ text, emoji, bg, color }) {
  const safe = escapeXml(text);
  const fontSize = text.length <= 4 ? 56 : text.length <= 8 ? 42 : 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="#0b1220"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <rect x="28" y="28" width="456" height="456" rx="80" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="6"/>
  <text x="256" y="210" text-anchor="middle" font-size="140">${emoji}</text>
  <text x="256" y="360" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif" font-size="${fontSize}" font-weight="700" fill="${color}">${safe}</text>
</svg>`;
}

/** Pack cụm từ giao tiếp hằng ngày — ưu tiên hiện đầu danh sách sticker. */
export const CHAT_PHRASE_STICKER_ITEMS = [
  phraseSticker('xin-loi', 'Xin lỗi', ['xin lỗi', 'sorry', 'lỗi', 'tha lỗi'], {
    emoji: '🙏',
    bg: '#7c3aed',
  }),
  phraseSticker('xin-loi-nha', 'Xin lỗi nha', ['xin lỗi', 'sorry', 'lỗi'], {
    emoji: '🥺',
    bg: '#6d28d9',
  }),
  phraseSticker('tha-loi', 'Tha lỗi', ['xin lỗi', 'sorry', 'tha lỗi', 'please'], {
    emoji: '🙇',
    bg: '#5b21b6',
  }),
  phraseSticker('da', 'Dạ', ['dạ', 'vâng', 'yes', 'ok', 'ạ'], {
    emoji: '🙂',
    bg: '#0369a1',
  }),
  phraseSticker('vang', 'Vâng', ['vâng', 'dạ', 'yes', 'ok'], {
    emoji: '✔️',
    bg: '#0e7490',
  }),
  phraseSticker('vang-a', 'Vâng ạ', ['vâng', 'dạ', 'yes', 'ạ'], {
    emoji: '🫡',
    bg: '#155e75',
  }),
  phraseSticker('cam-on', 'Cảm ơn', ['cảm ơn', 'thanks', 'thank you'], {
    emoji: '🙏',
    bg: '#047857',
  }),
  phraseSticker('cam-on-nhieu', 'Cảm ơn nhiều', ['cảm ơn', 'thanks', 'grateful'], {
    emoji: '🥰',
    bg: '#065f46',
  }),
  phraseSticker('da-ta', 'Đa tạ', ['đa tạ', 'cảm ơn', 'thanks'], {
    emoji: '🙇‍♂️',
    bg: '#14532d',
  }),
  phraseSticker('ok', 'OK', ['ok', 'được', 'yes', 'oke'], {
    emoji: '👍',
    bg: '#1d4ed8',
  }),
  phraseSticker('duoc', 'Được', ['được', 'ok', 'yes'], {
    emoji: '👌',
    bg: '#1e40af',
  }),
  phraseSticker('khong', 'Không', ['không', 'no', 'từ chối'], {
    emoji: '🙅',
    bg: '#b91c1c',
  }),
  phraseSticker('chua', 'Chưa', ['chưa', 'not yet', 'no'], {
    emoji: '⏳',
    bg: '#c2410c',
  }),
  phraseSticker('doi-chut', 'Đợi chút', ['đợi', 'chờ', 'wait', 'khoan'], {
    emoji: '✋',
    bg: '#b45309',
  }),
  phraseSticker('chao', 'Chào', ['chào', 'hello', 'hi', 'xin chào'], {
    emoji: '👋',
    bg: '#0284c7',
  }),
  phraseSticker('xin-chao', 'Xin chào', ['xin chào', 'hello', 'hi', 'chào'], {
    emoji: '🙌',
    bg: '#0369a1',
  }),
  phraseSticker('tam-biet', 'Tạm biệt', ['tạm biệt', 'bye', 'goodbye'], {
    emoji: '👋',
    bg: '#334155',
  }),
  phraseSticker('hen-gap', 'Hẹn gặp lại', ['hẹn', 'gặp lại', 'bye', 'tạm biệt'], {
    emoji: '🤝',
    bg: '#475569',
  }),
  phraseSticker('haha', 'Haha', ['haha', 'cười', 'lol', 'vui'], {
    emoji: '😂',
    bg: '#ca8a04',
  }),
  phraseSticker('hehe', 'Hehe', ['hehe', 'cười', 'vui'], {
    emoji: '🤭',
    bg: '#a16207',
  }),
  phraseSticker('buon', 'Buồn', ['buồn', 'sad'], {
    emoji: '😢',
    bg: '#1e3a8a',
  }),
  phraseSticker('met', 'Mệt quá', ['mệt', 'tired', 'đuối'], {
    emoji: '😩',
    bg: '#312e81',
  }),
  phraseSticker('vui', 'Vui quá', ['vui', 'happy', 'yeah'], {
    emoji: '🥳',
    bg: '#be185d',
  }),
  phraseSticker('tuyet', 'Tuyệt', ['tuyệt', 'hay', 'good', 'nice'], {
    emoji: '🔥',
    bg: '#9f1239',
  }),
  phraseSticker('giup', 'Giúp với', ['giúp', 'help', 'please', 'nhờ'], {
    emoji: '🆘',
    bg: '#b91c1c',
  }),
  phraseSticker('nho', 'Nhờ bạn', ['nhờ', 'giúp', 'please', 'help'], {
    emoji: '🤲',
    bg: '#9f1239',
  }),
  phraseSticker('chuc-mung', 'Chúc mừng', ['chúc mừng', 'congrats', 'mừng'], {
    emoji: '🎉',
    bg: '#a21caf',
  }),
  phraseSticker('ngu-ngon', 'Ngủ ngon', ['ngủ ngon', 'sleep', 'good night', 'ngủ'], {
    emoji: '😴',
    bg: '#1e3a8a',
  }),
  phraseSticker('an-com', 'Ăn cơm chưa', ['ăn cơm', 'ăn', 'lunch', 'food', 'cơm'], {
    emoji: '🍚',
    bg: '#9a3412',
  }),
  phraseSticker('uong-nuoc', 'Uống nước đi', ['uống', 'nước', 'drink', 'break'], {
    emoji: '💧',
    bg: '#0e7490',
  }),
  phraseSticker('lam-viec', 'Làm việc thôi', ['làm việc', 'work', 'busy'], {
    emoji: '💼',
    bg: '#0f766e',
  }),
  phraseSticker('xong', 'Xong rồi', ['xong', 'done', 'ok', 'hoàn thành'], {
    emoji: '✅',
    bg: '#15803d',
  }),
  phraseSticker('gap', 'Gấp quá', ['gấp', 'deadline', 'nhanh', 'urgent'], {
    emoji: '⏰',
    bg: '#c2410c',
  }),
  phraseSticker('hieu', 'Hiểu rồi', ['hiểu', 'ok', 'rõ', 'got it'], {
    emoji: '💡',
    bg: '#a16207',
  }),
  phraseSticker('dong-y', 'Đồng ý', ['đồng ý', 'ok', 'yes', 'approve'], {
    emoji: '🤝',
    bg: '#1d4ed8',
  }),
  phraseSticker('tu-choi', 'Từ chối', ['từ chối', 'không', 'no', 'reject'], {
    emoji: '🚫',
    bg: '#991b1b',
  }),
  phraseSticker('yeu', 'Yêu quá', ['yêu', 'love', 'thích'], {
    emoji: '❤️',
    bg: '#be123c',
  }),
  phraseSticker('thich', 'Thích', ['thích', 'like', 'love'], {
    emoji: '😍',
    bg: '#e11d48',
  }),
  phraseSticker('khoan', 'Khoan đã', ['khoan', 'đợi', 'wait', 'chờ'], {
    emoji: '⏸️',
    bg: '#b45309',
  }),
  phraseSticker('okela', 'Okela', ['okela', 'ok', 'được', 'oke'], {
    emoji: '😎',
    bg: '#2563eb',
  }),
];
