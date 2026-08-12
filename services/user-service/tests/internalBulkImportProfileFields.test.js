const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * TC-EX-002 / 006 — service layer contract for Excel bulk fields (sau wire route).
 * Không cần Mongo: chỉ assert validation + method tồn tại.
 */
describe('internalBulkImportProfileFields contract (TC-EX-002/006)', () => {
  it('service exports internalBulkImportProfileFields', () => {
    // Lazy: tránh throw khi thiếu env Mongo ở load-time của deps khác
    const UserService = require('../src/services/user.service');
    assert.equal(typeof UserService.internalBulkImportProfileFields, 'function');
    assert.equal(typeof UserService.deleteUserProfile, 'function');
  });

  it('rejects empty userId with USER_VALIDATION', async () => {
    const UserService = require('../src/services/user.service');
    await assert.rejects(
      () => UserService.internalBulkImportProfileFields('', {}),
      (err) => err.statusCode === 400 && err.errorCode === 'USER_VALIDATION'
    );
  });
});
