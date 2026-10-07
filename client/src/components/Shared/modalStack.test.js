import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isTopModal, popModal, pushModal } from './modalStack.js';

describe('modalStack', () => {
  const outer = {};
  const inner = {};

  afterEach(() => {
    popModal(outer);
    popModal(inner);
  });

  it('empty stack has no top', () => {
    assert.equal(isTopModal(outer), false);
  });

  it('last pushed modal is top', () => {
    pushModal(outer);
    assert.equal(isTopModal(outer), true);
    pushModal(inner);
    assert.equal(isTopModal(inner), true);
    assert.equal(isTopModal(outer), false);
  });

  it('closing the inner modal restores outer as top', () => {
    pushModal(outer);
    pushModal(inner);
    popModal(inner);
    assert.equal(isTopModal(outer), true);
  });

  it('popping out of order keeps the remaining top', () => {
    pushModal(outer);
    pushModal(inner);
    popModal(outer);
    assert.equal(isTopModal(inner), true);
    popModal(inner);
    assert.equal(isTopModal(inner), false);
  });

  it('pushing the same token twice does not duplicate it', () => {
    pushModal(outer);
    pushModal(outer);
    popModal(outer);
    assert.equal(isTopModal(outer), false);
  });

  it('ignores missing token', () => {
    pushModal(null);
    assert.equal(isTopModal(null), false);
  });
});
