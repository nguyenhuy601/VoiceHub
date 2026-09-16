const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { IMPORT_SESSION_STATUS } = require('../src/constants/requirementLifecycle');

describe('IMPORT_SESSION_STATUS vs analysis confirm', () => {
  it('includes imported (analysis confirm must use this, not confirmed)', () => {
    assert.ok(IMPORT_SESSION_STATUS.includes('imported'));
    assert.equal(IMPORT_SESSION_STATUS.includes('confirmed'), false);
  });
});
