const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRequiredProjectRoles } = require('../src/utils/requiredProjectRoles');

describe('normalizeRequiredProjectRoles', () => {
  it('keeps positive integer counts only', () => {
    assert.deepEqual(normalizeRequiredProjectRoles([{ roleKey: 'developer', requiredCount: 2 }]), [
      { roleKey: 'developer', requiredCount: 2 },
    ]);
  });

  it('drops invalid and zero counts', () => {
    assert.deepEqual(
      normalizeRequiredProjectRoles([
        { roleKey: 'developer', requiredCount: 0 },
        { roleKey: 'qa', requiredCount: -4 },
        { roleKey: '', requiredCount: 2 },
      ]),
      []
    );
  });

  it('last positive entry wins for duplicate keys', () => {
    assert.deepEqual(
      normalizeRequiredProjectRoles([
        { roleKey: 'developer', requiredCount: 1 },
        { roleKey: 'developer', requiredCount: 3.8 },
      ]),
      [{ roleKey: 'developer', requiredCount: 3 }]
    );
  });
});
