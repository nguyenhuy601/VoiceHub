const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  sortOrderFromIndex,
  nextAppendSortOrder,
  validateOrderedIdsPermutation,
  insertIdAtPlace,
} = require('../utils/catalogSortOrder');

describe('catalogSortOrder', () => {
  it('sortOrderFromIndex uses 10-step', () => {
    assert.equal(sortOrderFromIndex(0), 10);
    assert.equal(sortOrderFromIndex(1), 20);
    assert.equal(sortOrderFromIndex(2), 30);
  });

  it('nextAppendSortOrder appends after max', () => {
    assert.equal(nextAppendSortOrder([]), 10);
    assert.equal(nextAppendSortOrder([{ sortOrder: 10 }, { sortOrder: 30 }]), 40);
  });

  it('validateOrderedIdsPermutation rejects mismatch', () => {
    assert.equal(validateOrderedIdsPermutation(['a', 'b'], ['a']).ok, false);
    assert.equal(validateOrderedIdsPermutation(['a', 'b'], ['a', 'b', 'c']).ok, false);
    assert.equal(validateOrderedIdsPermutation(['a', 'b'], ['a', 'a']).ok, false);
    assert.equal(validateOrderedIdsPermutation(['a', 'b'], ['a', 'c']).ok, false);
    assert.equal(validateOrderedIdsPermutation(['a', 'b'], ['b', 'a']).ok, true);
  });

  it('insertIdAtPlace supports start/after/end', () => {
    assert.deepEqual(insertIdAtPlace(['a', 'b'], 'x', { place: 'start' }), ['x', 'a', 'b']);
    assert.deepEqual(insertIdAtPlace(['a', 'b'], 'x', { place: 'after', afterRoleId: 'a' }), ['a', 'x', 'b']);
    assert.deepEqual(insertIdAtPlace(['a', 'b'], 'x', { place: 'end' }), ['a', 'b', 'x']);
    assert.deepEqual(insertIdAtPlace(['a', 'b'], 'x', { place: 'after', afterRoleId: 'missing' }), ['a', 'b', 'x']);
  });
});
