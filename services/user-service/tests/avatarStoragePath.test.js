const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAvatarKey,
  isLegacyUploadsPath,
  isMinioAvatarKey,
  contentTypeFromAvatarPath,
  legacyDiskFileName,
} = require('../src/utils/avatarStoragePath');

describe('avatarStoragePath', () => {
  it('buildAvatarKey dùng prefix users/{id}/avatars/', () => {
    const key = buildAvatarKey('abc123', '.png');
    assert.match(key, /^users\/abc123\/avatars\/\d+-\d+\.png$/);
  });

  it('buildAvatarKey chuẩn hóa ext thiếu dấu chấm', () => {
    const key = buildAvatarKey('u1', 'webp');
    assert.match(key, /\.webp$/);
  });

  it('buildAvatarKey từ chối userId rỗng', () => {
    assert.throws(() => buildAvatarKey('', '.jpg'), /userId required/);
  });

  it('isLegacyUploadsPath nhận /uploads/…', () => {
    assert.equal(isLegacyUploadsPath('/uploads/avatar-1.jpg'), true);
    assert.equal(isLegacyUploadsPath('uploads/avatar-1.jpg'), true);
    assert.equal(isLegacyUploadsPath('users/u1/avatars/1.jpg'), false);
  });

  it('isMinioAvatarKey nhận users/…/avatars/…', () => {
    assert.equal(isMinioAvatarKey('users/u1/avatars/1.jpg'), true);
    assert.equal(isMinioAvatarKey('/uploads/avatar-1.jpg'), false);
  });

  it('contentTypeFromAvatarPath theo extension', () => {
    assert.equal(contentTypeFromAvatarPath('users/u1/avatars/x.webp'), 'image/webp');
    assert.equal(contentTypeFromAvatarPath('/uploads/a.jpg'), 'image/jpeg');
  });

  it('legacyDiskFileName chỉ basename an toàn', () => {
    assert.equal(legacyDiskFileName('/uploads/avatar-9.jpg'), 'avatar-9.jpg');
    assert.equal(legacyDiskFileName('/uploads/../etc/passwd'), 'passwd');
  });
});
