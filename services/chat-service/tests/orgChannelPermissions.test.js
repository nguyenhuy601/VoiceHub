const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Pure contract helpers mirrored from orgChannelPermissions (D6).
 * Không require module đầy đủ (tránh phụ thuộc axios/org S2S khi unit).
 */
function denyChannel(message, statusCode = 403) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function requireOrgAndRoom(orgId, roomId) {
  if (!orgId || !roomId) {
    throw denyChannel('organizationId and roomId are required', 400);
  }
}

describe('D6 roomId+organizationId contract', () => {
  it('rejects missing orgId', () => {
    assert.throws(() => requireOrgAndRoom('', 'room1'), (err) => err.statusCode === 400);
  });
  it('rejects missing roomId', () => {
    assert.throws(() => requireOrgAndRoom('org1', ''), (err) => err.statusCode === 400);
  });
  it('accepts both', () => {
    assert.doesNotThrow(() => requireOrgAndRoom('org1', 'room1'));
  });
});
