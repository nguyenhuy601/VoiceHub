const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

function startsWithBytes(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function asciiAt(buffer, offset, length) {
  if (buffer.length < offset + length) return '';
  return buffer.toString('latin1', offset, offset + length);
}

function sniffIsoBmff(buffer) {
  if (asciiAt(buffer, 4, 4) !== 'ftyp') return null;
  const majorBrand = asciiAt(buffer, 8, 4).toLowerCase();
  if (AVIF_BRANDS.has(majorBrand)) return { ext: '.avif', mime: 'image/avif' };
  if (HEIC_BRANDS.has(majorBrand)) return { ext: '.heic', mime: 'image/heic' };
  return null;
}

/**
 * Nhận diện ảnh theo magic bytes (không tin đuôi file / Content-Type client gửi lên).
 * SVG/HTML/PDF đổi đuôi `.png` → null.
 * @param {Buffer} buffer
 * @returns {{ ext: string, mime: string } | null}
 */
function sniffImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return { ext: '.jpg', mime: 'image/jpeg' };
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ext: '.png', mime: 'image/png' };
  }
  const head6 = asciiAt(buffer, 0, 6);
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return { ext: '.gif', mime: 'image/gif' };
  if (asciiAt(buffer, 0, 4) === 'RIFF' && asciiAt(buffer, 8, 4) === 'WEBP') {
    return { ext: '.webp', mime: 'image/webp' };
  }
  if (startsWithBytes(buffer, [0x42, 0x4d]) && buffer.length >= 26) {
    return { ext: '.bmp', mime: 'image/bmp' };
  }
  if (startsWithBytes(buffer, [0x00, 0x00, 0x01, 0x00])) return { ext: '.ico', mime: 'image/x-icon' };
  return sniffIsoBmff(buffer);
}

module.exports = { sniffImageType };
