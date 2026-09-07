const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROUTES_PATH = path.join(__dirname, '../src/routes/auth.routes.js');

const ACCOUNT_SUFFIXES = [
  'summary',
  'lock',
  'force-password',
  'reset-password',
  'login-events',
  'revoke-sessions',
  'set-password',
  'activate',
  'resend-verification',
];

describe('auth company user account routes', () => {
  it('registers canonical /users only', () => {
    const src = fs.readFileSync(ROUTES_PATH, 'utf8');
    assert.ok(src.includes("pathPrefix = '/users'"));
    assert.equal(src.includes('/admin/users'), false);
    for (const suffix of ACCOUNT_SUFFIXES) {
      assert.ok(src.includes(`:userId/${suffix}`), `missing action ${suffix}`);
    }
  });
});
