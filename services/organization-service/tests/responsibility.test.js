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
const { allocateUniqueRoleKey, slugifyRoleKey } = require('@enterprise/shared/utils/roleKeySlug');

describe('responsibility.service helpers', () => {
  it('normalizeKey uses shared slugify (diacritics + spaces)', () => {
    assert.equal(normalizeKey('  Backend '), 'backend');
    assert.equal(normalizeKey('Front End'), 'front_end');
    assert.equal(normalizeKey('Phát triển Backend'), 'phat_trien_backend');
  });

  it('allocateUniqueRoleKey collisions for responsibility labels', () => {
    assert.equal(allocateUniqueRoleKey(slugifyRoleKey('Backend'), ['backend']), 'backend_2');
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
