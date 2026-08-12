const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertResolvedProjectRoleKeys } = require('../src/utils/assertResolvedProjectRoleKeys');

describe('assertResolvedProjectRoleKeys', () => {
  it('rejects empty keys', () => {
    assert.throws(
      () => assertResolvedProjectRoleKeys([], [{ _id: '1' }]),
      (err) => err.statusCode === 400 && /ít nhất một project role/.test(err.message)
    );
  });

  it('rejects keys that resolve to zero roles', () => {
    assert.throws(
      () => assertResolvedProjectRoleKeys(['nope'], []),
      (err) => err.statusCode === 400 && /hợp lệ/.test(err.message)
    );
  });

  it('passes when at least one role resolved', () => {
    assert.doesNotThrow(() =>
      assertResolvedProjectRoleKeys(['developer'], [{ _id: 'r1', key: 'developer' }])
    );
  });
});
