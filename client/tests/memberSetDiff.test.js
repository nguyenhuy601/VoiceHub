import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diffMemberSets, hasMemberChanges } from '../src/features/adminOrgStructure/memberSetDiff.js';

describe('diffMemberSets', () => {
  it('tách người thêm / người bỏ, giữ thứ tự', () => {
    const diff = diffMemberSets(['a', 'b', 'c'], ['b', 'd', 'a', 'e']);
    assert.deepEqual(diff, { added: ['d', 'e'], removed: ['c'] });
    assert.equal(hasMemberChanges(diff), true);
  });

  it('không đổi → rỗng', () => {
    const diff = diffMemberSets(['a', 'b'], ['b', 'a']);
    assert.deepEqual(diff, { added: [], removed: [] });
    assert.equal(hasMemberChanges(diff), false);
  });

  it('trim, bỏ rỗng/trùng, chịu input không phải mảng', () => {
    assert.deepEqual(diffMemberSets([' a ', 'a', '', null], ['a', 'b', 'b']), { added: ['b'], removed: [] });
    assert.deepEqual(diffMemberSets(undefined, ['x']), { added: ['x'], removed: [] });
    assert.deepEqual(diffMemberSets(['x'], null), { added: [], removed: ['x'] });
  });
});
