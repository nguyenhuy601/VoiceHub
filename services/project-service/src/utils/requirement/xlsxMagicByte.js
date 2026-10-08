/**
 * ZIP local-file header magic used by .xlsx (OOXML).
 * PK\x03\x04
 */
const XLSX_ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * @param {Buffer|Uint8Array|null|undefined} buffer
 * @returns {boolean}
 */
function isXlsxZipMagic(buffer) {
  if (!buffer || typeof buffer.length !== 'number' || buffer.length < 4) return false;
  return (
    buffer[0] === XLSX_ZIP_MAGIC[0] &&
    buffer[1] === XLSX_ZIP_MAGIC[1] &&
    buffer[2] === XLSX_ZIP_MAGIC[2] &&
    buffer[3] === XLSX_ZIP_MAGIC[3]
  );
}

module.exports = {
  XLSX_ZIP_MAGIC,
  isXlsxZipMagic,
};
