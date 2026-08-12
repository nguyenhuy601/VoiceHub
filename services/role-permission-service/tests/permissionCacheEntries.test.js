const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOrgPermissionCacheEntry,
  buildProjectPermissionCacheEntry,
} = require('../src/services/permissionCacheEntries');

describe('permissionCacheEntries', () => {
  it('builds org entry', () => {
    const e = buildOrgPermissionCacheEntry('u1', 'o1', ['project:read']);
    assert.equal(e.key, 'perm:org:o1:user:u1');
    assert.deepEqual(e.value.permissions, ['project:read']);
  });

  it('builds project entry', () => {
    const e = buildProjectPermissionCacheEntry('u1', 'p1', ['task:write']);
    assert.equal(e.key, 'perm:project:p1:user:u1');
  });
});
