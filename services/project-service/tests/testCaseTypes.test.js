const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  TEST_CASE_RESULTS,
  assertTestCaseResult,
} = require('../src/utils/work/testCaseTypes');

describe('test case result validation', () => {
  it('accepts pass and fail', () => {
    assert.deepEqual([...TEST_CASE_RESULTS], ['pass', 'fail']);
    assert.equal(assertTestCaseResult('PASS'), 'pass');
    assert.equal(assertTestCaseResult(' fail '), 'fail');
  });

  it('rejects unsupported results', () => {
    assert.throws(
      () => assertTestCaseResult('blocked'),
      (err) => err.statusCode === 400 && err.message === 'result phải là pass hoặc fail'
    );
  });
});
