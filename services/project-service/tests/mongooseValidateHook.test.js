/**
 * Mongoose 9: document middleware không nhận callback `next`.
 * Regression cho Project.pre('validate') — gọi next() → 400 "next is not a function" khi create.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

describe('mongoose 9 pre(validate) without next', () => {
  it('sync hook không gọi next vẫn validate + coerce status', async () => {
    const schema = new mongoose.Schema({
      status: { type: String, enum: ['ready_for_planning', 'closed'] },
    });
    schema.pre('validate', function coerceLegacyStatus() {
      if (String(this.status) === 'cancelled') this.status = 'closed';
    });
    const Model =
      mongoose.models.Mongoose9ValidateHookTest ||
      mongoose.model('Mongoose9ValidateHookTest', schema);
    const doc = new Model({ status: 'cancelled' });
    await assert.doesNotReject(() => doc.validate());
    assert.equal(doc.status, 'closed');
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
