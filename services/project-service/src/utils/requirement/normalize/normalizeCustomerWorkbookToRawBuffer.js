/**
 * Pure normalize (no auth / no DB) — Chuẩn hóa dữ liệu → Customer Raw buffer.
 */

const { logger } = require('@enterprise/shared');
const {
  detectCustomerWorkbookProfile,
  PROFILE_NEWAY_TRANG_CHU,
  PROFILE_UNKNOWN,
} = require('./detectCustomerWorkbookProfile');
const {
  mapNewayTrangChuToRawPayload,
} = require('./adapters/newayTrangChu');
const {
  buildNormalizedCustomerRawBuffer,
  downloadFileName,
} = require('./buildNormalizedCustomerRawBuffer');
const {
  validateCustomerRawForm,
} = require('../customerRawFormValidate');

function unsupportedError(message) {
  const err = new Error(
    message || 'Định dạng file không được hỗ trợ để chuẩn hóa sang Customer Raw'
  );
  err.statusCode = 422;
  err.errorCode = 'RAW_NORMALIZE_UNSUPPORTED_FORMAT';
  return err;
}

/**
 * @param {Buffer} fileBuffer
 * @param {{ fileName?: string }} [opts]
 * @returns {Promise<{ buffer: Buffer, fileName: string, profile: string, counts: object }>}
 */
async function normalizeCustomerWorkbookToRawBuffer(fileBuffer, opts = {}) {
  const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer || []);
  if (!buffer.length) {
    const err = new Error('file (.xlsx) bắt buộc');
    err.statusCode = 400;
    err.errorCode = 'REQ_IMPORT_FILE_REQUIRED';
    throw err;
  }

  const fileName = opts.fileName || '';
  const detected = detectCustomerWorkbookProfile(buffer);
  if (detected.profile === PROFILE_UNKNOWN || !detected.workbook) {
    logger.info('[raw_normalize] unsupported format file=%s', String(fileName).slice(0, 80));
    throw unsupportedError();
  }

  let payload;
  if (detected.profile === PROFILE_NEWAY_TRANG_CHU) {
    payload = mapNewayTrangChuToRawPayload(
      detected.workbook,
      {
        sheetName: detected.sheetName,
        featureHeaderRow: detected.featureHeaderRow,
      },
      { fileName }
    );
  } else {
    throw unsupportedError();
  }

  const outBuffer = await buildNormalizedCustomerRawBuffer(payload);
  const form = validateCustomerRawForm(outBuffer);
  if (!form.ok) {
    const err = new Error('Chuẩn hóa thất bại — output Raw không hợp lệ');
    err.statusCode = 500;
    err.errorCode = 'RAW_NORMALIZE_OUTPUT_INVALID';
    err.details = { form };
    throw err;
  }

  const outName = downloadFileName(detected.profile);
  logger.info(
    '[raw_normalize] profile=%s crCount=%s file=%s',
    detected.profile,
    payload.counts?.requirements || 0,
    String(fileName).slice(0, 80)
  );

  return {
    buffer: outBuffer,
    fileName: outName,
    profile: detected.profile,
    counts: payload.counts || {},
  };
}

module.exports = {
  normalizeCustomerWorkbookToRawBuffer,
  unsupportedError,
};
