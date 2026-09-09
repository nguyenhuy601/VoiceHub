const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.ORGANIZATION_SERVICE_URL =
  process.env.ORGANIZATION_SERVICE_URL || 'http://org-service.test';

const { createTtlCoalesceCache } = require('../src/utils/ttlCoalesceCache');
const {
  fetchTaskWorkspaceScope,
  _clearTaskWorkspaceScopeCacheForTests,
  _setTaskWorkspaceScopeCacheTtlForTests,
  _setTaskWorkspaceScopeHttpGetForTests,
} = require('../src/services/taskWorkspaceScope');
const {
  fetchProjectVisibilityContext,
  _clearProjectVisibilityContextCacheForTests,
  _setProjectVisibilityContextCacheTtlForTests,
  _setProjectVisibilityContextHttpGetForTests,
} = require('../src/clients/orgVisibility.client');

describe('ttlCoalesceCache', () => {
  it('returns cached value within TTL and reloads after expiry', async () => {
    const cache = createTtlCoalesceCache({ ttlMs: 30 });
    let loads = 0;
    const load = async () => {
      loads += 1;
      return { n: loads };
    };
    const a = await cache.getOrLoad('k', load);
    const b = await cache.getOrLoad('k', load);
    assert.equal(a.n, 1);
    assert.equal(b.n, 1);
    assert.equal(loads, 1);
    await new Promise((r) => setTimeout(r, 40));
    const c = await cache.getOrLoad('k', load);
    assert.equal(c.n, 2);
    assert.equal(loads, 2);
  });

  it('coalesces parallel misses into one loader call', async () => {
    const cache = createTtlCoalesceCache({ ttlMs: 15_000 });
    let loads = 0;
    const load = () =>
      new Promise((resolve) => {
        loads += 1;
        setTimeout(() => resolve({ ok: true, loads }), 20);
      });
    const [a, b] = await Promise.all([cache.getOrLoad('p', load), cache.getOrLoad('p', load)]);
    assert.equal(loads, 1);
    assert.equal(a.loads, 1);
    assert.equal(b.loads, 1);
  });
});

describe('fetchTaskWorkspaceScope cache', () => {
  before(() => {
    _setTaskWorkspaceScopeCacheTtlForTests(15_000);
  });

  beforeEach(() => {
    _clearTaskWorkspaceScopeCacheForTests();
    _setTaskWorkspaceScopeHttpGetForTests(null);
  });

  afterEach(() => {
    _setTaskWorkspaceScopeHttpGetForTests(null);
    _clearTaskWorkspaceScopeCacheForTests();
    _setTaskWorkspaceScopeCacheTtlForTests(15_000);
  });

  it('calls HTTP once for same user/org within TTL', async () => {
    let calls = 0;
    _setTaskWorkspaceScopeHttpGetForTests(async () => {
      calls += 1;
      return { status: 200, data: { data: { visibility: 'org', membershipRole: 'member' } } };
    });
    const a = await fetchTaskWorkspaceScope('u1', 'org1');
    const b = await fetchTaskWorkspaceScope('u1', 'org1');
    assert.equal(calls, 1);
    assert.equal(a.visibility, 'org');
    assert.equal(b.visibility, 'org');
  });

  it('coalesces parallel fetches', async () => {
    let calls = 0;
    _setTaskWorkspaceScopeHttpGetForTests(
      () =>
        new Promise((resolve) => {
          calls += 1;
          setTimeout(
            () => resolve({ status: 200, data: { data: { visibility: 'team' } } }),
            25
          );
        })
    );
    const [a, b] = await Promise.all([
      fetchTaskWorkspaceScope('u2', 'org2'),
      fetchTaskWorkspaceScope('u2', 'org2'),
    ]);
    assert.equal(calls, 1);
    assert.equal(a.visibility, 'team');
    assert.equal(b.visibility, 'team');
  });

  it('reloads after TTL expiry', async () => {
    _setTaskWorkspaceScopeCacheTtlForTests(25);
    let calls = 0;
    _setTaskWorkspaceScopeHttpGetForTests(async () => {
      calls += 1;
      return { status: 200, data: { data: { visibility: 'self', n: calls } } };
    });
    await fetchTaskWorkspaceScope('u3', 'org3');
    await new Promise((r) => setTimeout(r, 35));
    const again = await fetchTaskWorkspaceScope('u3', 'org3');
    assert.equal(calls, 2);
    assert.equal(again.n, 2);
  });
});

describe('fetchProjectVisibilityContext cache', () => {
  beforeEach(() => {
    _clearProjectVisibilityContextCacheForTests();
    _setProjectVisibilityContextHttpGetForTests(null);
    _setProjectVisibilityContextCacheTtlForTests(15_000);
  });

  afterEach(() => {
    _setProjectVisibilityContextHttpGetForTests(null);
    _clearProjectVisibilityContextCacheForTests();
  });

  it('calls HTTP once for same org/user within TTL', async () => {
    let calls = 0;
    _setProjectVisibilityContextHttpGetForTests(async () => {
      calls += 1;
      return {
        status: 200,
        data: { data: { isOrgMember: true, membershipRole: 'member', organizationRoleKeys: ['r1'] } },
      };
    });
    const a = await fetchProjectVisibilityContext('orgA', 'userA');
    const b = await fetchProjectVisibilityContext('orgA', 'userA');
    assert.equal(calls, 1);
    assert.equal(a.isOrgMember, true);
    assert.equal(b.organizationRoleKeys[0], 'r1');
  });
});
