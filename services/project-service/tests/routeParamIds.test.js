const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { bindObjectIdParam } = require('../src/utils/common/bindObjectIdParam');

function mockRes() {
  return {
    headersSent: false,
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe('bindObjectIdParam', () => {
  it('rejects non-ObjectId and does not call next', async () => {
    const router = express.Router();
    bindObjectIdParam(router, 'boardId');
    const layer = router.params.boardId[0];
    const res = mockRes();
    let nextCalled = false;
    await new Promise((resolve) => {
      layer({ params: {} }, res, () => {
        nextCalled = true;
        resolve();
      }, 'abc');
      setImmediate(resolve);
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.errorCode, 'VALIDATION_INVALID_ID');
  });

  it('rejects 23-char and object-like strings', async () => {
    const router = express.Router();
    bindObjectIdParam(router, 'id');
    const layer = router.params.id[0];
    for (const bad of ['0123456789abcdef0123456', '{"$ne":1}']) {
      const res = mockRes();
      let nextCalled = false;
      await new Promise((resolve) => {
        layer({ params: {} }, res, () => {
          nextCalled = true;
          resolve();
        }, bad);
        setImmediate(resolve);
      });
      assert.equal(nextCalled, false, bad);
      assert.equal(res.statusCode, 400, bad);
    }
  });

  it('accepts valid ObjectId and calls next', async () => {
    const router = express.Router();
    bindObjectIdParam(router, 'taskId');
    const layer = router.params.taskId[0];
    const res = mockRes();
    const req = { params: {} };
    const oid = '0123456789abcdef01234567';
    await new Promise((resolve) => {
      layer(req, res, () => resolve(), oid);
    });
    assert.equal(req.params.taskId, oid);
    assert.equal(res.statusCode, 0);
  });
});
