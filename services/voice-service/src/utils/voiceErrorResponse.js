const { sendServiceError } = require('../middlewares/sendServiceError');

const RECORDING_ERROR_CODE = 'VOICE_RECORDING_ERROR';
const RECORDING_UNAVAILABLE_CODE = 'VOICE_RECORDING_UNAVAILABLE';
const RECORDING_UNAVAILABLE_MESSAGE = 'Tính năng ghi âm tạm thời không khả dụng. Vui lòng thử lại sau.';
const SOCKET_GENERIC_MESSAGE = 'Không thể xử lý thao tác thoại lúc này';

/** Lỗi nội bộ (roomManager / namespace) không có statusCode nhưng an toàn để báo người dùng. */
const SOCKET_KNOWN_ERRORS = [
  { pattern: /^roomId is required$/, message: 'Thiếu mã phòng' },
  { pattern: /^No active meeting$/, message: 'Chưa có cuộc họp đang diễn ra' },
  { pattern: /^Room not found$/, message: 'Phòng không tồn tại hoặc đã đóng' },
  { pattern: /^Peer not found/, message: 'Bạn chưa ở trong phòng' },
  {
    pattern: /^(Transport|Producer|Consumer) not found$/,
    message: 'Kết nối thoại đã hết hạn, vui lòng vào lại phòng',
  },
];

function resolveStatus(err) {
  const code = Number(err?.statusCode);
  return code >= 400 && code < 600 ? code : 500;
}

function sendRecordingError(res, err) {
  const status = resolveStatus(err);
  if (status < 500) {
    return sendServiceError(res, status, {
      errorCode: err?.errorCode || RECORDING_ERROR_CODE,
      message: err?.message,
    });
  }
  if (status === 503) {
    return sendServiceError(res, 503, {
      errorCode: RECORDING_UNAVAILABLE_CODE,
      messageUser: RECORDING_UNAVAILABLE_MESSAGE,
    });
  }
  return sendServiceError(res, status, { errorCode: RECORDING_ERROR_CODE });
}

function socketErrorMessage(err, fallback = SOCKET_GENERIC_MESSAGE) {
  const raw = String(err?.message || '').trim();
  const status = Number(err?.statusCode);
  if (raw && status >= 400 && status < 500) return raw;
  if (!raw || status >= 500) return fallback;
  const known = SOCKET_KNOWN_ERRORS.find((entry) => entry.pattern.test(raw));
  return known ? known.message : fallback;
}

module.exports = {
  sendRecordingError,
  socketErrorMessage,
  RECORDING_ERROR_CODE,
  RECORDING_UNAVAILABLE_CODE,
  SOCKET_GENERIC_MESSAGE,
};
