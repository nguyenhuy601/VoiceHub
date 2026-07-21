const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeKey,
  DEFAULT_RESPONSIBILITY_KEYS,
} = require('../src/services/responsibility.service');
const {
  ROLE_KIND,
  assertNotResponsibilityForPermission,
} = require('@enterprise/shared/config/roleTaxonomy');

describe('responsibility.service helpers', () => {
  it('normalizeKey lowercases and trims', () => {
    assert.equal(normalizeKey('  Backend '), 'backend');
    assert.equal(normalizeKey('Front End'), 'front_end');
  });

  it('seed keys include backend/frontend/qa', () => {
    assert.ok(DEFAULT_RESPONSIBILITY_KEYS.includes('backend'));
    assert.ok(DEFAULT_RESPONSIBILITY_KEYS.includes('frontend'));
    assert.ok(DEFAULT_RESPONSIBILITY_KEYS.includes('qa'));
  });

  it('responsibility is not a permission grant', () => {
    assert.throws(() => assertNotResponsibilityForPermission(ROLE_KIND.RESPONSIBILITY));
  });
});
