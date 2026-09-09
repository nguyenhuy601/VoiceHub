/**
 * Sửa chuỗi UTF-8 bị đọc nhầm như Latin-1/Windows-1252 (mojibake).
 * Ví dụ: "Äang xá»­ lÃ½" → "Đang xử lý".
 */

const MOJIBAKE_HINT =
  /Ã[\u0080-\u00BF]|Ä[\u0080-\u00BF]|Å[\u0080-\u00BF]|Æ.|Ç.|á»[\u0080-\u00BF]|â€.|Ã¡|Ã |Ã©|Ã­|Ã³|Ãº|Ä‘|Ä|á»|á» |á»±|á»ƒ|á»‡/;

const VI_LETTER =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/;

export function looksLikeUtf8Mojibake(value) {
  const s = String(value || '');
  if (!s) return false;
  return MOJIBAKE_HINT.test(s);
}

function latin1BytesToUtf8(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/** @param {unknown} value @returns {string} */
export function repairUtf8Mojibake(value) {
  const input = String(value ?? '');
  if (!input || !looksLikeUtf8Mojibake(input)) return input;
  let repaired;
  try {
    repaired = latin1BytesToUtf8(input);
  } catch {
    return input;
  }
  if (!repaired || repaired.includes('\uFFFD')) return input;
  if (!looksLikeUtf8Mojibake(repaired) || VI_LETTER.test(repaired)) {
    return repaired;
  }
  return input;
}
