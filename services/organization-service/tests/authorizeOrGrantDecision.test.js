const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAuthorizeOrGrant } = require('../src/utils/authorizeOrGrantDecision');

test('membership admin không được qua khi không có grant', () => {
  const decision = resolveAuthorizeOrGrant({
    membership: { role: 'admin' },
    grantAllowed: false,
    orgAccessOk: true,
  });
  assert.equal(decision.allow, false);
  assert.equal(decision.via, null);
});

test('đúng grant thì qua, kể cả membership member', () => {
  const decision = resolveAuthorizeOrGrant({
    membership: { role: 'member' },
    grantAllowed: true,
    orgAccessOk: true,
  });
  assert.deepEqual(decision, { allow: true, via: 'grant' });
});

test('system admin đã đối chiếu DB thì qua route bảo trì', () => {
  const decision = resolveAuthorizeOrGrant({
    membership: { role: 'admin' },
    grantAllowed: false,
    orgAccessOk: true,
    storedAdminVerified: true,
  });
  assert.deepEqual(decision, { allow: true, via: 'stored-admin' });
});

test('không có membership và không có grant thì từ chối', () => {
  const decision = resolveAuthorizeOrGrant({
    membership: null,
    grantAllowed: false,
    orgAccessOk: false,
    storedAdminVerified: false,
  });
  assert.equal(decision.allow, false);
});
