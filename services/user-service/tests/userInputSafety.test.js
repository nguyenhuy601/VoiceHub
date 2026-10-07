const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { PATHS, setMock, clearMocks, installSharedMock, mockRes } = require('./helpers/userServiceMocks');
const {
  isObjectIdString,
  toPlainId,
  readPagination,
  maskEmailForLog,
} = require('../src/utils/userInputSafety');

const UID = '64b0000000000000000000aa';

describe('userInputSafety', () => {
  it('readPagination clamps garbage, negative and huge values', () => {
    assert.deepEqual(readPagination({ limit: '100000', page: '-5' }), { page: 1, limit: 50 });
    assert.deepEqual(readPagination({ limit: 'abc', page: 'x' }), { page: 1, limit: 20 });
    assert.deepEqual(readPagination({ limit: '0', page: '9999' }), { page: 100, limit: 1 });
    assert.deepEqual(readPagination({ limit: ['5'], page: { $gt: 1 } }), { page: 1, limit: 5 });
    assert.deepEqual(readPagination(undefined), { page: 1, limit: 20 });
  });

  it('toPlainId blocks operator objects and arrays', () => {
    assert.equal(toPlainId({ $ne: 1 }), null);
    assert.equal(toPlainId(['a']), null);
    assert.equal(toPlainId('  abc '), 'abc');
    assert.equal(toPlainId(''), null);
  });

  it('isObjectIdString only accepts 24 hex chars', () => {
    assert.equal(isObjectIdString(UID), true);
    assert.equal(isObjectIdString('abc'), false);
    assert.equal(isObjectIdString({ $ne: 1 }), false);
  });

  it('maskEmailForLog hides the local part', () => {
    assert.equal(maskEmailForLog('Admin@VoiceHub.local'), 'ad***@voicehub.local');
    assert.equal(maskEmailForLog('a@x.io'), 'a***@x.io');
    assert.equal(maskEmailForLog('no-at'), '***');
    assert.equal(maskEmailForLog(''), '');
  });
});

describe('controller input guards', () => {
  let calls;

  function installControllerMocks(statusDoc) {
    clearMocks();
    installSharedMock();
    calls = { getById: 0, statusArgs: [], searchArgs: null };
    setMock(PATHS.userService, {
      getUserProfileById: async () => {
        calls.getById += 1;
        return null;
      },
      updateStatus: async (...args) => {
        calls.statusArgs.push(args);
        return statusDoc;
      },
      searchUsers: async (q, opts) => {
        calls.searchArgs = opts;
        return { users: [], total: 0 };
      },
    });
    setMock(PATHS.objectStorage, { isEnabled: () => false });
    setMock(PATHS.authSummaryClient, {
      fetchAuthSummaryByUserId: async () => null,
      fetchAuthSummaryByUserIds: async () => new Map(),
    });
  }

  afterEach(clearMocks);

  const statusDoc = {
    userId: UID,
    username: 'u',
    displayName: 'U',
    avatar: null,
    status: 'online',
    emailBlindIndex: 'blind-email',
    phoneBlindIndex: 'blind-phone',
    encV: 2,
    email: 'enc:v2:ciphertext',
    phone: 'enc:v2:ciphertext',
  };

  it('GET /users/:id with an invalid id -> 400 USER_INVALID_ID without DB lookup', async () => {
    installControllerMocks(statusDoc);
    const controller = require(PATHS.controller);
    const res = mockRes();
    await controller.getUserProfileById({ params: { userId: 'abc' }, headers: {} }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'USER_INVALID_ID');
    assert.equal(calls.getById, 0);
  });

  it('GET avatar with an invalid id -> 400', async () => {
    installControllerMocks(statusDoc);
    const controller = require(PATHS.controller);
    const res = mockRes();
    await controller.getUserAvatar({ params: { userId: 'abc' }, userContext: { userId: UID }, headers: {} }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'USER_INVALID_ID');
  });

  it('search clamps limit/page before calling the service', async () => {
    installControllerMocks(statusDoc);
    const controller = require(PATHS.controller);
    const res = mockRes();
    await controller.searchUsers(
      {
        query: { q: 'an', limit: '100000', page: '-5' },
        headers: {},
        originalUrl: '/api/users/internal/search',
      },
      res
    );
    assert.deepEqual(calls.searchArgs, { page: 1, limit: 50 });
  });

  it('internal profiles batch > 200 -> 400 USER_BATCH_TOO_LARGE', async () => {
    installControllerMocks(statusDoc);
    const controller = require(PATHS.controller);
    const res = mockRes();
    const userIds = Array.from({ length: 201 }, (_, i) => `64b0000000000000000${String(i).padStart(5, '0')}`);
    await controller.internalProfilesBatch({ body: { userIds }, headers: {} }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'USER_BATCH_TOO_LARGE');
  });

  it('internal status rejects operator object userId', async () => {
    installControllerMocks(statusDoc);
    const controller = require(PATHS.controller);
    const res = mockRes();
    await controller.patchInternalStatus({ body: { userId: { $ne: null }, status: 'online' }, headers: {} }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(calls.statusArgs.length, 0);
  });

  it('updateStatus / internal status responses omit blind index and ciphertext', async () => {
    installControllerMocks(statusDoc);
    const controller = require(PATHS.controller);
    const selfRes = mockRes();
    await controller.updateStatus({ userContext: { userId: UID }, body: { status: 'online' }, headers: {} }, selfRes);
    const internalRes = mockRes();
    await controller.patchInternalStatus({ body: { userId: UID, status: 'online' }, headers: {} }, internalRes);
    for (const res of [selfRes, internalRes]) {
      const text = JSON.stringify(res.body);
      for (const marker of ['BlindIndex', 'encV', 'ciphertext', '"email"', '"phone"']) {
        assert.equal(text.includes(marker), false, `leaks ${marker}`);
      }
      assert.equal(res.body.data.status, 'online');
      assert.equal(res.body.data.userId, UID);
    }
  });
});
