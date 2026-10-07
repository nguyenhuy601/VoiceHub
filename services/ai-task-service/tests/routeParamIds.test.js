const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { bindObjectIdParams, requireObjectId } = require('../src/utils/bindObjectIdParam');

describe('bindObjectIdParam', () => {
  it('requireObjectId rejects invalid', () => {
    let status;
    let body;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(payload) {
        body = payload;
        return payload;
      },
    };
    assert.equal(requireObjectId(res, 'not-an-id', 'id'), null);
    assert.equal(status, 400);
    assert.equal(body.errorCode, 'VALIDATION_INVALID_ID');
  });

  it('requireObjectId accepts 24-hex', () => {
    const res = { status() { return this; }, json() {} };
    const id = requireObjectId(res, 'aaaaaaaaaaaaaaaaaaaaaaaa', 'id');
    assert.equal(id, 'aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('router.param is bound for id and taskId', () => {
    const router = express.Router();
    bindObjectIdParams(router, ['id', 'taskId']);
    assert.equal(typeof router.params.id, 'object');
    assert.equal(typeof router.params.taskId, 'object');
  });
});

