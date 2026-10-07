const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const logger = require('@enterprise/shared/utils/logger');
const {
  toChatError,
  isDuplicateKeyError,
  isUserMessageTypeAllowed,
  createChatError,
} = require('../src/utils/chatErrorMap');
const { compareGatewayToken } = require('@enterprise/shared/middleware/compareGatewayToken');
const { errorHandler, notFoundHandler } = require('../src/middleware/errorHandler');
const { toClientMessage } = require('../src/utils/messageDto');

function mockReq() {
  return { method: 'POST', originalUrl: '/api/messages' };
}

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
      return this;
    },
  };
}

const originalWarn = logger.warn;
const originalError = logger.error;

before(() => {
  logger.warn = () => {};
  logger.error = () => {};
});

after(() => {
  logger.warn = originalWarn;
  logger.error = originalError;
});

describe('toChatError', () => {
  it('giữ lỗi nghiệp vụ có statusCode', () => {
    const err = createChatError(403, 'CHAT_FORBIDDEN', 'Không đủ quyền');
    assert.equal(toChatError(err), err);
  });

  it('duplicate key → 409, vẫn nhận diện duplicate qua cause/message', () => {
    const mapped = toChatError(Object.assign(new Error('E11000 dup key: host=db-1'), { code: 11000 }));
    assert.equal(mapped.statusCode, 409);
    assert.equal(mapped.errorCode, 'CHAT_DUPLICATE');
    assert.match(mapped.message, /duplicate/i);
    assert.ok(!mapped.message.includes('db-1'));
    assert.equal(isDuplicateKeyError(mapped), true);
  });

  it('CastError → 400 CHAT_INVALID_ID', () => {
    const cast = Object.assign(new Error('Cast to ObjectId failed for value "x"'), { name: 'CastError' });
    const mapped = toChatError(cast);
    assert.equal(mapped.statusCode, 400);
    assert.equal(mapped.errorCode, 'CHAT_INVALID_ID');
  });

  it('lỗi hạ tầng → 500 không nhúng message gốc', () => {
    const mapped = toChatError(new Error('connect ECONNREFUSED mongodb://10.0.0.5:27017'));
    assert.equal(mapped.statusCode, 500);
    assert.equal(mapped.errorCode, 'CHAT_INTERNAL_ERROR');
    assert.ok(!mapped.message.includes('ECONNREFUSED'));
    assert.equal(isDuplicateKeyError(mapped), false);
  });
});

describe('errorHandler', () => {
  it('JSON hỏng → 400 CHAT_INVALID_JSON', () => {
    const res = mockRes();
    errorHandler({ type: 'entity.parse.failed', message: 'Unexpected token < at 0' }, mockReq(), res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'CHAT_INVALID_JSON');
    assert.ok(!JSON.stringify(res.body).includes('Unexpected token'));
  });

  it('body quá lớn → 413', () => {
    const res = mockRes();
    errorHandler({ type: 'entity.too.large', message: 'request entity too large' }, mockReq(), res, () => {});
    assert.equal(res.statusCode, 413);
    assert.equal(res.body.errorCode, 'CHAT_PAYLOAD_TOO_LARGE');
  });

  it('4xx giữ messageUser, bỏ errorCode không an toàn', () => {
    const res = mockRes();
    const err = Object.assign(new Error('raw'), {
      statusCode: 404,
      errorCode: 'bad code<script>',
      messageUser: 'Không tìm thấy tin nhắn',
    });
    errorHandler(err, mockReq(), res, () => {});
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.message, 'Không tìm thấy tin nhắn');
    assert.notEqual(res.body.errorCode, 'bad code<script>');
  });

  it('5xx → message chung, không lộ stack/host', () => {
    const res = mockRes();
    errorHandler(new Error('MongoNetworkError: mongo-1:27017 timed out'), mockReq(), res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.errorCode, 'CHAT_INTERNAL_ERROR');
    assert.ok(!JSON.stringify(res.body).includes('mongo-1'));
  });

  it('headersSent → chuyển next(err)', () => {
    const res = mockRes();
    res.headersSent = true;
    const err = new Error('late');
    let forwarded = null;
    errorHandler(err, mockReq(), res, (e) => {
      forwarded = e;
    });
    assert.equal(forwarded, err);
    assert.equal(res.body, null);
  });

  it('notFoundHandler → 404 CHAT_ROUTE_NOT_FOUND', () => {
    const res = mockRes();
    notFoundHandler(mockReq(), res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.errorCode, 'CHAT_ROUTE_NOT_FOUND');
  });
});

describe('toClientMessage — tin đã thu hồi/xóa', () => {
  const base = {
    _id: 'm1',
    senderId: 'u1',
    content: 'bí mật',
    messageType: 'file',
    fileMeta: { storagePath: 'chat/o1/a.pdf', mimeType: 'application/pdf' },
    refs: [{ kind: 'task', id: 't1', projectId: 'p1' }],
  };

  it('recalled → content rỗng, không fileMeta/refs', () => {
    const out = toClientMessage({ ...base, isRecalled: true });
    assert.equal(out.content, '');
    assert.equal(out.fileMeta, undefined);
    assert.equal(out.refs, undefined);
  });

  it('deleted (full) → content rỗng, không originalContent', () => {
    const out = toClientMessage({ ...base, isDeleted: true, originalContent: 'gốc' }, { fields: 'full' });
    assert.equal(out.content, '');
    assert.equal(out.fileMeta, undefined);
    assert.equal(out.originalContent, undefined);
  });

  it('system placeholder bị GC xóa vẫn giữ content', () => {
    const out = toClientMessage({
      _id: 'm2',
      senderId: 'u1',
      content: '[Tệp đã hết hạn]',
      messageType: 'system',
      isDeleted: true,
    });
    assert.equal(out.content, '[Tệp đã hết hạn]');
  });

  it('full shape không trả originalContent kể cả tin bình thường', () => {
    const out = toClientMessage({ ...base, originalContent: 'gốc' }, { fields: 'full' });
    assert.equal(out.originalContent, undefined);
    assert.equal(out.content, 'bí mật');
  });
});

describe('isUserMessageTypeAllowed', () => {
  it('cho phép loại người dùng ở DM và kênh', () => {
    for (const type of ['text', 'image', 'file', 'business_card']) {
      assert.equal(isUserMessageTypeAllowed(type, { isRoom: false }), true);
      assert.equal(isUserMessageTypeAllowed(type, { isRoom: true }), true);
    }
  });

  it('system chỉ cho kênh, không cho DM', () => {
    assert.equal(isUserMessageTypeAllowed('system', { isRoom: true }), true);
    assert.equal(isUserMessageTypeAllowed('system', { isRoom: false }), false);
  });

  it('chặn loại nội bộ/lạ', () => {
    for (const type of ['call_log', 'activity', '<script>', '']) {
      assert.equal(isUserMessageTypeAllowed(type, { isRoom: true }), false);
    }
  });
});

describe('compareGatewayToken (internal chat)', () => {
  it('khớp token', () => {
    assert.equal(compareGatewayToken('secret-token', 'secret-token'), true);
  });

  it('khác nội dung hoặc khác độ dài → false, không throw', () => {
    assert.equal(compareGatewayToken('secret-tokeX', 'secret-token'), false);
    assert.equal(compareGatewayToken('short', 'secret-token'), false);
  });

  it('rỗng → false', () => {
    assert.equal(compareGatewayToken('', ''), false);
    assert.equal(compareGatewayToken(undefined, 'x'), false);
  });
});
