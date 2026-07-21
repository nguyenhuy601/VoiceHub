const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('orgUnitNameConflict helpers', () => {
  it('exports finders', () => {
    const mod = require('../src/utils/orgUnitNameConflict');
    assert.equal(typeof mod.findActiveDepartmentNameConflict, 'function');
    assert.equal(typeof mod.findActiveTeamNameConflict, 'function');
  });
});
