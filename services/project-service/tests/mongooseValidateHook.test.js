/**
 * Mongoose 9: document middleware không nhận callback `next`.
 * Regression cho Project.pre('validate') — gọi next() → 400 "next is not a function" khi create.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { coerceProjectLifecycleStatus } = require('../src/utils/project/projectInitFields');

describe('mongoose 9 pre(validate) without next', () => {
  it('sync hook không gọi next vẫn validate + coerce status', async () => {
    const schema = new mongoose.Schema({
      status: { type: String, enum: ['draft', 'active', 'on_hold', 'closed'] },
    });
    schema.pre('validate', function coerceLegacyStatus() {
      const coerced = coerceProjectLifecycleStatus(this.status);
      if (coerced) this.status = coerced;
    });
    const Model =
      mongoose.models.Mongoose9ValidateHookTest ||
      mongoose.model('Mongoose9ValidateHookTest', schema);
    const doc = new Model({ status: 'cancelled' });
    await assert.doesNotReject(() => doc.validate());
    assert.equal(doc.status, 'closed');
  });

  it('coerces ready_for_planning and in_development before enum validate', async () => {
    const schema = new mongoose.Schema({
      status: { type: String, enum: ['draft', 'active', 'on_hold', 'closed'] },
    });
    schema.pre('validate', function coerceLegacyStatus() {
      const coerced = coerceProjectLifecycleStatus(this.status);
      if (coerced) this.status = coerced;
    });
    const Model =
      mongoose.models.Mongoose9ValidateHookLegacy ||
      mongoose.model('Mongoose9ValidateHookLegacy', schema);

    const draftDoc = new Model({ status: 'ready_for_planning' });
    await assert.doesNotReject(() => draftDoc.validate());
    assert.equal(draftDoc.status, 'draft');

    const activeDoc = new Model({ status: 'in_development' });
    await assert.doesNotReject(() => activeDoc.validate());
    assert.equal(activeDoc.status, 'active');
  });

  it('gọi next() khi next undefined → TypeError (pattern cũ)', () => {
    let nextType;
    const schema = new mongoose.Schema({ name: String });
    schema.pre('validate', function bad(next) {
      nextType = typeof next;
      if (typeof next === 'function') next();
      else throw new TypeError('next is not a function');
    });
    const Model =
      mongoose.models.Mongoose9ValidateHookBad ||
      mongoose.model('Mongoose9ValidateHookBad', schema);
    const doc = new Model({ name: 'x' });
    return assert.rejects(() => doc.validate(), /next is not a function/).then(() => {
      assert.equal(nextType, 'undefined');
    });
  });
});
