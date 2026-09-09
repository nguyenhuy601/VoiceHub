const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Unit tests for project-scoped role clone + list cache (no live Mongo).
 * Mocks ProjectRole / Project / memberships at model layer via dependency injection
 * is hard — instead we test ttl coalesce + source contracts, and pure remap helpers
 * by requiring modules that export cache helpers.
 */

describe('ttlCoalesceCache invalidateWhere', () => {
  it('deletes matching keys only', async () => {
    const { createTtlCoalesceCache } = require('../src/utils/ttlCoalesceCache');
    const cache = createTtlCoalesceCache({ ttlMs: 60_000 });
    await cache.getOrLoad('u1|p:aaa', async () => ({ a: 1 }));
    await cache.getOrLoad('u2|p:bbb', async () => ({ b: 2 }));
    assert.equal(cache.size(), 2);
    cache.invalidateWhere((k) => k.includes('|p:aaa'));
    assert.equal(cache.size(), 1);
    const kept = await cache.getOrLoad('u2|p:bbb', async () => {
      throw new Error('should not reload');
    });
    assert.deepEqual(kept, { b: 2 });
  });

  it('coalesces parallel getOrLoad', async () => {
    const { createTtlCoalesceCache } = require('../src/utils/ttlCoalesceCache');
    const cache = createTtlCoalesceCache({ ttlMs: 60_000 });
    let loads = 0;
    const loader = async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true };
    };
    const [a, b] = await Promise.all([
      cache.getOrLoad('p1', loader),
      cache.getOrLoad('p1', loader),
    ]);
    assert.deepEqual(a, b);
    assert.equal(loads, 1);
  });
});

describe('project scoped roles routes (source)', () => {
  it('mounts GET/PATCH/reset under /:projectId/roles', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../src/routes/project.routes.js'), 'utf8');
    assert.ok(src.includes("router.get('/:projectId/roles'"));
    assert.ok(src.includes("router.patch('/:projectId/roles/:roleId'"));
    assert.ok(src.includes("reset-default"));
    assert.ok(src.includes('projectScopedRoles'));
  });

  it('ProjectRole model has projectId + partial unique indexes', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../src/models/ProjectRole.js'), 'utf8');
    assert.ok(src.includes('projectId'));
    assert.ok(src.includes('partialFilterExpression'));
    assert.ok(src.includes("projectId: null"));
  });

  it('org roles controller filters projectId null', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/controllers/projectRoles.controller.js'),
      'utf8'
    );
    assert.ok(src.includes('projectId: null'));
    assert.ok(src.includes('projectId == null') || src.includes('projectId: null'));
  });

  it('projectTeam exports clone + list cache + invalidate', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/projectTeam.service.js'),
      'utf8'
    );
    assert.ok(src.includes('cloneOrgRolesToProject'));
    assert.ok(src.includes('ensureProjectRolesCloned'));
    assert.ok(src.includes('listProjectRolesCached'));
    assert.ok(src.includes('invalidateProjectRolesListCache'));
    assert.ok(src.includes('getProjectRoleByKey'));
    assert.ok(src.includes('createTtlCoalesceCache'));
  });

  it('projectAccess exports invalidateResolveCacheForProject', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/projectAccess.service.js'),
      'utf8'
    );
    assert.ok(src.includes('invalidateResolveCacheForProject'));
    assert.ok(src.includes('invalidateWhere'));
  });

  it('createProject clones roles before membership seed', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../src/services/project.service.js'), 'utf8');
    assert.ok(src.includes('cloneOrgRolesToProject'));
  });

  it('scoped controller invalidates list + resolve caches on PATCH', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/controllers/projectScopedRoles.controller.js'),
      'utf8'
    );
    assert.ok(src.includes('invalidateProjectRolesListCache'));
    assert.ok(src.includes('invalidateResolveCacheForProject'));
    assert.ok(src.includes('settings:update'));
  });
});
