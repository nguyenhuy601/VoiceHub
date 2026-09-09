const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  resolveProfileViewMode,
  resolveProfilePatchMode,
} = require('../src/utils/profileAccessMode');

describe('resolveProfileViewMode', () => {
  it('peer GET không gắn companyAdmin', () => {
    assert.equal(
      resolveProfileViewMode({ actorId: 'a1', targetUserId: 'b2', companyAdmin: null }),
      'peer'
    );
  });

  it('self GET', () => {
    assert.equal(
      resolveProfileViewMode({ actorId: 'a1', targetUserId: 'a1' }),
      'self'
    );
  });

  it('company admin GET dùng admin shape kể cả self', () => {
    assert.equal(
      resolveProfileViewMode({
        actorId: 'a1',
        targetUserId: 'a1',
        companyAdmin: { level: 'hr', organizationId: 'o1' },
      }),
      'admin'
    );
  });
});

describe('resolveProfilePatchMode', () => {
  it('member PATCH user khác = forbidden', () => {
    assert.equal(
      resolveProfilePatchMode({ actorId: 'a1', targetUserId: 'b2' }),
      'forbidden'
    );
  });

  it('self PATCH không org = self', () => {
    assert.equal(
      resolveProfilePatchMode({ actorId: 'a1', targetUserId: 'a1' }),
      'self'
    );
  });

  it('HR PATCH (kể cả self) = admin — verify không rơi self mode', () => {
    assert.equal(
      resolveProfilePatchMode({
        actorId: 'a1',
        targetUserId: 'a1',
        companyAdmin: { level: 'hr' },
      }),
      'admin'
    );
    assert.equal(
      resolveProfilePatchMode({
        actorId: 'hr1',
        targetUserId: 'emp2',
        companyAdmin: { level: 'hr' },
      }),
      'admin'
    );
  });
});

describe('user.routes actor REST', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/routes/user.routes.js'),
    'utf8'
  );

  it('canonical PATCH /:userId after protect; no /admin alias', () => {
    const protectIdx = src.indexOf('router.use(protect)');
    const patchCanonical = /router\.patch\(\s*'\/:userId'/m.test(src);
    assert.ok(protectIdx > 0);
    assert.equal(src.includes("'/admin/:userId'"), false);
    assert.ok(patchCanonical, 'PATCH /:userId registered');
    assert.match(src, /attachCompanyAdminIfPresent/);
  });
});
