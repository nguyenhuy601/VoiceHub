const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertOrgInviteAllowed,
  ORG_RATE_LIMITED,
} = require('../src/utils/orgInviteLimit');
const { toOrgError } = require('../src/utils/orgErrorMap');

function sliceExport(src, name) {
  const start = src.indexOf(`exports.${name} = async`);
  assert.ok(start >= 0, name);
  const next = src.indexOf('\nexports.', start + 10);
  return src.slice(start, next === -1 ? src.length : next);
}

describe('assertOrgInviteAllowed', () => {
  it('invite over limit throws ORG_RATE_LIMITED and does not continue', async () => {
    let writes = 0;
    await assert.rejects(
      async () => {
        await assertOrgInviteAllowed({
          userId: 'u1',
          bucket: 'invite',
          checkRateLimit: async () => ({ allowed: false, remaining: 0 }),
        });
        writes += 1;
      },
      (err) => err.errorCode === ORG_RATE_LIMITED && err.statusCode === 429 && err.bucket === 'invite'
    );
    assert.equal(writes, 0);
  });

  it('join uses org:join key, not org:invite', async () => {
    let seen = '';
    await assertOrgInviteAllowed({
      userId: 'u1',
      bucket: 'join',
      checkRateLimit: async ({ key }) => {
        seen = key;
        return { allowed: true, remaining: 1 };
      },
    });
    assert.equal(seen, 'org:join:u1');
    assert.equal(seen.includes('org:invite:'), false);
  });

  it('no redis / limiter allows: does not invent 429 (D4)', async () => {
    await assertOrgInviteAllowed({
      userId: 'u1',
      bucket: 'invite',
      checkRateLimit: async () => ({ allowed: true, remaining: 20 }),
    });
  });
});

describe('toOrgError keeps 429', () => {
  it('ORG_RATE_LIMITED stays 429 with the limiter message', () => {
    const mapped = toOrgError({
      statusCode: 429,
      errorCode: ORG_RATE_LIMITED,
      message: 'Quá nhiều thao tác. Vui lòng thử lại sau.',
    });
    assert.equal(mapped.statusCode, 429);
    assert.equal(mapped.errorCode, ORG_RATE_LIMITED);
    assert.match(mapped.message, /Quá nhiều/);
  });
});

describe('member controller source contract', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/controllers/memberController.js'),
    'utf8'
  );

  it('inviteMember asserts invite before the department lookup', () => {
    const body = sliceExport(src, 'inviteMember');
    const gate = body.indexOf("bucket: 'invite'");
    const lookup = body.indexOf('Department.findOne');
    assert.ok(gate >= 0 && lookup > gate);
  });

  it('createInviteLink asserts invite before the branch lookup', () => {
    const body = sliceExport(src, 'createInviteLink');
    const gate = body.indexOf("bucket: 'invite'");
    const lookup = body.indexOf('Branch.findOne');
    assert.ok(gate >= 0 && lookup > gate);
  });

  it('joinViaLink asserts join before the organization lookup', () => {
    const body = sliceExport(src, 'joinViaLink');
    const gate = body.indexOf("bucket: 'join'");
    const lookup = body.indexOf('Organization.findById');
    assert.ok(gate >= 0 && lookup > gate);
  });

  it('accept, list, leave, role, and delete do not rate-limit', () => {
    for (const name of [
      'acceptCompanyInvite',
      'getMembers',
      'leaveOrganization',
      'updateMemberRole',
      'removeMember',
    ]) {
      const body = sliceExport(src, name);
      assert.equal(body.includes('bucket:'), false, name);
    }
  });
});
