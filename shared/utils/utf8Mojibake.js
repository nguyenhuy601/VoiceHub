/**
 * Sửa chuỗi UTF-8 bị đọc nhầm như Latin-1/Windows-1252 (mojibake).
 * Ví dụ: "Äang xá»­ lÃ½" → "Đang xử lý".
 * Idempotent: chuỗi đã đúng tiếng Việt thì giữ nguyên.
 */

const MOJIBAKE_HINT =
  /Ã[\u0080-\u00BF]|Ä[\u0080-\u00BF]|Å[\u0080-\u00BF]|Æ.|Ç.|á»[\u0080-\u00BF]|â€.|Ã¡|Ã |Ã©|Ã­|Ã³|Ãº|Ä‘|Ä|á»|á» |á»±|á»ƒ|á»‡/;

const VI_LETTER =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/;

function looksLikeUtf8Mojibake(value) {
  const s = String(value || '');
  if (!s) return false;
  return MOJIBAKE_HINT.test(s);
}

function latin1BytesToUtf8(str) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'latin1').toString('utf8');
  }
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  return str;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function repairUtf8Mojibake(value) {
  const input = String(value ?? '');
  if (!input || !looksLikeUtf8Mojibake(input)) return input;
  let repaired;
  try {
    repaired = latin1BytesToUtf8(input);
  } catch {
    return input;
  }
  if (!repaired || repaired.includes('\uFFFD')) return input;
  // Đã sửa được (bớt marker mojibake hoặc có dấu Việt).
  if (!looksLikeUtf8Mojibake(repaired) || VI_LETTER.test(repaired)) {
    return repaired;
  }
  return input;
}

module.exports = {
  looksLikeUtf8Mojibake,
  repairUtf8Mojibake,
};
