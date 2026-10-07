const SUMMARY_ERRORS = Object.freeze({
  SUMMARY_BAD_REQUEST: { status: 400, message: 'Dữ liệu yêu cầu không hợp lệ' },
  SUMMARY_SCOPE_UNSUPPORTED: { status: 400, message: 'Chỉ hỗ trợ tóm tắt kênh của tổ chức' },
  SUMMARY_USER_CONTEXT_MISSING: { status: 401, message: 'Thiếu thông tin người dùng' },
  SUMMARY_FORBIDDEN: { status: 403, message: 'Bạn không có quyền truy cập hội thoại này' },
  SUMMARY_NOT_FOUND: { status: 404, message: 'Không tìm thấy bản tóm tắt' },
  SUMMARY_ROUTE_NOT_FOUND: { status: 404, message: 'Không tìm thấy đường dẫn' },
  SUMMARY_PAYLOAD_TOO_LARGE: { status: 413, message: 'Dữ liệu gửi lên quá lớn' },
  SUMMARY_NO_MESSAGES: { status: 422, message: 'Không có tin nhắn để tóm tắt' },
  SUMMARY_RATE_LIMITED: {
    status: 429,
    message: 'Bạn yêu cầu tóm tắt quá nhanh, vui lòng thử lại sau ít phút',
  },
  SUMMARY_INTERNAL: { status: 500, message: 'Lỗi hệ thống, vui lòng thử lại sau' },
  SUMMARY_EXPORT_FAILED: { status: 502, message: 'Không thể tải lịch sử hội thoại' },
  SUMMARY_VERIFY_UNAVAILABLE: {
    status: 503,
    message: 'Không thể xác minh quyền truy cập lúc này, vui lòng thử lại sau',
  },
  SUMMARY_QUEUE_UNAVAILABLE: {
    status: 503,
    message: 'Hàng đợi tóm tắt tạm thời không khả dụng, vui lòng thử lại sau',
  },
});

const INTERNAL_CODE = 'SUMMARY_INTERNAL';

class SummaryError extends Error {
  constructor(code, { cause } = {}) {
    const resolved = SUMMARY_ERRORS[code] ? code : INTERNAL_CODE;
    super(resolved);
    this.name = 'SummaryError';
    this.code = resolved;
    if (cause) this.cause = cause;
  }
}

function resolveSummaryError(err) {
  const code = err instanceof SummaryError ? err.code : INTERNAL_CODE;
  const { status, message } = SUMMARY_ERRORS[code];
  return { status, code, message };
}

function buildSummaryErrorBody(code) {
  const { message } = SUMMARY_ERRORS[code] || SUMMARY_ERRORS[INTERNAL_CODE];
  return { success: false, message, messageUser: message, errorCode: code };
}

function sendSummaryError(res, err) {
  if (res.headersSent) return res;
  const { status, code } = resolveSummaryError(err);
  return res.status(status).json(buildSummaryErrorBody(code));
}

module.exports = {
  SUMMARY_ERRORS,
  SummaryError,
  resolveSummaryError,
  buildSummaryErrorBody,
  sendSummaryError,
};
