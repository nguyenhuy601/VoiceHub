const test = require('node:test');
const assert = require('node:assert/strict');
const { GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');
const {
  sendRecordingError,
  socketErrorMessage,
  SOCKET_GENERIC_MESSAGE,
} = require('../src/utils/voiceErrorResponse');
const errorHandler = require('../src/middlewares/errorHandler');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
  };
}

function withStatus(message, statusCode, extra = {}) {
  return Object.assign(new Error(message), { statusCode }, extra);
}

const mockReq = { method: 'POST', originalUrl: '/api/meetings/x/recording/upload' };

test('recording 4xx keeps business message', () => {
  const res = mockRes();
  sendRecordingError(res, withStatus('Only host may upload', 403));
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, 'Only host may upload');
  assert.equal(res.body.errorCode, 'VOICE_RECORDING_ERROR');
});

test('recording 503 returns unavailable code without storage detail', () => {
  const res = mockRes();
  sendRecordingError(res, withStatus('Object storage is not configured', 503));
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.errorCode, 'VOICE_RECORDING_UNAVAILABLE');
  const serialized = JSON.stringify(res.body);
  assert.ok(!/storage|disabled/i.test(serialized));
});

test('recording unknown error becomes 500 generic and ignores err.code', () => {
  const res = mockRes();
  const err = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:9000'), { code: 'ECONNREFUSED' });
  sendRecordingError(res, err);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, GENERIC_5XX_MESSAGE);
  assert.equal(res.body.errorCode, 'VOICE_RECORDING_ERROR');
  assert.ok(!JSON.stringify(res.body).includes('ECONNREFUSED'));
});

test('recording NoSuchKey without statusCode is not leaked', () => {
  const res = mockRes();
  sendRecordingError(res, new Error('NoSuchKey: The specified key does not exist.'));
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes('NoSuchKey'));
});

test('socket keeps 4xx business message', () => {
  assert.equal(socketErrorMessage(withStatus('Bạn không có quyền', 403)), 'Bạn không có quyền');
});

test('socket maps allowlisted internal errors to Vietnamese', () => {
  assert.equal(socketErrorMessage(new Error('roomId is required')), 'Thiếu mã phòng');
  assert.equal(socketErrorMessage(new Error('No active meeting')), 'Chưa có cuộc họp đang diễn ra');
  assert.equal(socketErrorMessage(new Error('Room not found')), 'Phòng không tồn tại hoặc đã đóng');
  assert.equal(socketErrorMessage(new Error('Peer not found in room')), 'Bạn chưa ở trong phòng');
  assert.equal(
    socketErrorMessage(new Error('Consumer not found')),
    'Kết nối thoại đã hết hạn, vui lòng vào lại phòng'
  );
});

test('socket masks mediasoup / 5xx / unknown errors', () => {
  assert.equal(socketErrorMessage(new Error('mediasoup dependency is missing')), SOCKET_GENERIC_MESSAGE);
  assert.equal(socketErrorMessage(withStatus('Mongo timeout', 500)), SOCKET_GENERIC_MESSAGE);
  assert.equal(socketErrorMessage(null), SOCKET_GENERIC_MESSAGE);
  assert.equal(socketErrorMessage(new Error('boom'), 'Không thể kết thúc phòng'), 'Không thể kết thúc phòng');
});

test('errorHandler maps multer LIMIT_FILE_SIZE to 413', () => {
  const res = mockRes();
  const err = Object.assign(new Error('File too large'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' });
  errorHandler(err, mockReq, res, () => {});
  assert.equal(res.statusCode, 413);
  assert.equal(res.body.errorCode, 'VOICE_UPLOAD_TOO_LARGE');
});

test('errorHandler maps other multer errors to 400', () => {
  const res = mockRes();
  const err = Object.assign(new Error('Unexpected field'), { name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE' });
  errorHandler(err, mockReq, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.errorCode, 'VOICE_UPLOAD_INVALID');
});

test('errorHandler maps JSON SyntaxError to 400 without stack', () => {
  const res = mockRes();
  const err = Object.assign(new SyntaxError('Unexpected token b in JSON at position 1'), {
    type: 'entity.parse.failed',
    status: 400,
    body: '{bad',
  });
  errorHandler(err, mockReq, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.errorCode, 'VOICE_INVALID_JSON');
  assert.ok(!JSON.stringify(res.body).includes('Unexpected token'));
});

test('errorHandler returns generic 500 for unknown errors', () => {
  const res = mockRes();
  errorHandler(new Error('mongo exploded at 10.0.0.2'), mockReq, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, GENERIC_5XX_MESSAGE);
  assert.equal(res.body.errorCode, 'VOICE_INTERNAL_ERROR');
});

test('errorHandler delegates when headers already sent', () => {
  const res = mockRes();
  res.headersSent = true;
  let forwarded = null;
  const err = new Error('late');
  errorHandler(err, mockReq, res, (e) => {
    forwarded = e;
  });
  assert.equal(forwarded, err);
  assert.equal(res.body, null);
});
