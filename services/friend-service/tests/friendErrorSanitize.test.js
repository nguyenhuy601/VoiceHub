const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');
const { mapFriendError, FRIEND_INTERNAL_ERROR } = require('../src/utils/friendErrorMap');
const { pickFriendSearchProfile } = require('../src/utils/friendSearchProfile');
const { sendServiceError } = require('../src/middleware/sendServiceError');
const errorHandler = require('../src/middleware/errorHandler');

function mockRes() {
  return {
    statusCode: null,
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

describe('mapFriendError', () => {
  it('keeps known business errors with Vietnamese message', () => {
    assert.deepEqual(mapFriendError(new Error('Already friends')), {
      status: 409,
      errorCode: 'FRIEND_ALREADY',
      message: 'Hai bạn đã là bạn bè',
    });
    assert.equal(mapFriendError(new Error('Friend request already sent')).status, 409);
    assert.equal(mapFriendError(new Error('Cannot send friend request to blocked user')).status, 403);
    assert.equal(mapFriendError(new Error('Cannot add yourself as a friend')).status, 400);
    assert.equal(mapFriendError(new Error('User not found')).status, 404);
    assert.equal(
      mapFriendError(new Error('Service temporarily unavailable. Please try again later.')).status,
      503
    );
  });

  it('maps wrapped service errors by substring', () => {
    const mapped = mapFriendError(new Error('Error accepting friend request: Friend request not found'));
    assert.equal(mapped.errorCode, 'FRIEND_NOT_FOUND');
    assert.equal(mapped.message.includes('Error accepting'), false);
    assert.equal(mapFriendError(new Error('Error unblocking user: Block relationship not found')).errorCode, 'FRIEND_NOT_FOUND');
    assert.equal(mapFriendError(new Error('Invalid user pair')).status, 400);
  });

  it('maps unknown errors to 500 without message', () => {
    for (const raw of [
      'Error accepting friend request: Cast to ObjectId failed for value "abc" at path "userId" for model "Friend"',
      'E11000 duplicate key error collection: friends index: userId_1_friendId_1',
      "Cannot read properties of undefined (reading 'toString')",
    ]) {
      const mapped = mapFriendError(new Error(raw));
      assert.equal(mapped.status, 500);
      assert.equal(mapped.errorCode, FRIEND_INTERNAL_ERROR);
      assert.equal(mapped.message, undefined);
    }
  });
});

describe('sendServiceError body', () => {
  it('5xx body is generic', () => {
    const res = mockRes();
    sendServiceError(res, 500, { errorCode: FRIEND_INTERNAL_ERROR });
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, GENERIC_5XX_MESSAGE);
    assert.equal(res.body.errorCode, FRIEND_INTERNAL_ERROR);
  });

  it('4xx body keeps business message and extra status', () => {
    const res = mockRes();
    sendServiceError(res, 404, {
      errorCode: 'FRIEND_USER_NOT_FOUND',
      message: 'Không tìm thấy người dùng',
      extra: { status: 'fail' },
    });
    assert.equal(res.body.message, 'Không tìm thấy người dùng');
    assert.equal(res.body.status, 'fail');
    assert.equal(res.body.success, false);
  });
});

describe('pickFriendSearchProfile', () => {
  it('returns only whitelisted fields', () => {
    const out = pickFriendSearchProfile({
      _id: 'u1',
      userId: 'u1',
      username: 'huy',
      displayName: 'Nhật Huy',
      avatar: 'a.png',
      email: 'x@y.z',
      capability: { skills: [] },
      jobTitle: 'Dev',
      departmentIds: ['d1'],
    });
    assert.deepEqual(Object.keys(out).sort(), ['_id', 'avatar', 'displayName', 'userId', 'username']);
  });

  it('returns null for empty input', () => {
    assert.equal(pickFriendSearchProfile(null), null);
  });
});

describe('errorHandler', () => {
  it('sanitizes 5xx', () => {
    const res = mockRes();
    errorHandler(new Error('MongoServerError: connection refused 10.0.0.5:27017'), {}, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, GENERIC_5XX_MESSAGE);
    assert.equal(JSON.stringify(res.body).includes('MongoServerError'), false);
  });

  it('keeps 4xx message', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Bad input'), { statusCode: 400 });
    errorHandler(err, {}, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Bad input');
  });

  it('delegates when headers already sent', () => {
    const res = mockRes();
    res.headersSent = true;
    let forwarded = null;
    const err = new Error('late');
    errorHandler(err, {}, res, (e) => {
      forwarded = e;
    });
    assert.equal(forwarded, err);
    assert.equal(res.body, null);
  });
});
