const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { PATHS, setMock, clearMocks, installSharedMock, mockRes } = require('./helpers/userServiceMocks');
const { sniffImageType } = require('../src/utils/imageSniff');
const { isOwnAvatarKey } = require('../src/utils/avatarStoragePath');

const UID = '64b0000000000000000000aa';
const OWN_KEY = `users/${UID}/avatars/1-1.png`;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8)]);
const AVIF = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif'), Buffer.alloc(8)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = Buffer.from('<!DOCTYPE html><html><body>x</body></html>');
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj');

describe('sniffImageType', () => {
  it('recognises real image signatures', () => {
    assert.equal(sniffImageType(PNG).mime, 'image/png');
    assert.equal(sniffImageType(JPEG).mime, 'image/jpeg');
    assert.equal(sniffImageType(GIF).mime, 'image/gif');
    assert.equal(sniffImageType(WEBP).mime, 'image/webp');
    assert.equal(sniffImageType(HEIC).ext, '.heic');
    assert.equal(sniffImageType(AVIF).ext, '.avif');
  });

  it('rejects SVG / HTML / PDF renamed to .png', () => {
    assert.equal(sniffImageType(SVG), null);
    assert.equal(sniffImageType(HTML), null);
    assert.equal(sniffImageType(PDF), null);
    assert.equal(sniffImageType(Buffer.alloc(0)), null);
    assert.equal(sniffImageType('not-a-buffer'), null);
  });
});

describe('isOwnAvatarKey', () => {
  it('accepts only the owner prefix', () => {
    assert.equal(isOwnAvatarKey(UID, OWN_KEY), true);
    assert.equal(isOwnAvatarKey(UID, 'users/other/avatars/1.png'), false);
    assert.equal(isOwnAvatarKey(UID, 'chat/x.pdf'), false);
    assert.equal(isOwnAvatarKey(UID, `users/${UID}/avatars/../../chat/x.pdf`), false);
    assert.equal(isOwnAvatarKey(UID, `users/${UID}/avatars/`), false);
    assert.equal(isOwnAvatarKey(UID, `users/${UID}/avatars/a/b.png`), false);
  });
});

describe('updateUserProfile ignores avatar from PATCH', () => {
  let updates;

  beforeEach(() => {
    clearMocks();
    updates = [];
    installSharedMock();
    const existing = { userId: UID, avatar: OWN_KEY, displayName: 'Old' };
    setMock(PATHS.userProfile, {
      findOne: () => ({ lean: async () => existing }),
      findOneAndUpdate: async (filter, op) => {
        updates.push(op);
        return { ...existing, ...(op.$set || {}) };
      },
    });
  });

  afterEach(clearMocks);

  it('drops avatar while keeping allowed fields', async () => {
    const service = require(PATHS.userService);
    const out = await service.updateUserProfile(UID, { avatar: 'chat/x.pdf', displayName: 'New' });
    assert.equal(updates.length, 1);
    assert.equal('avatar' in updates[0].$set, false);
    assert.equal(out.avatar, OWN_KEY);
  });

  it('avatar-only PATCH changes nothing', async () => {
    const service = require(PATHS.userService);
    const out = await service.updateUserProfile(UID, { avatar: 'chat/x.pdf' }, { capabilityMode: 'admin' });
    assert.equal(updates.length, 0);
    assert.equal(out.avatar, OWN_KEY);
  });
});

describe('avatar controller guards', () => {
  let state;

  function installControllerMocks(profileAvatar) {
    clearMocks();
    installSharedMock();
    state = { streamed: [], deleted: [], put: [], setAvatar: [] };
    setMock(PATHS.userService, {
      getUserProfileById: async () => (profileAvatar ? { userId: UID, avatar: profileAvatar } : null),
      setAvatarInternal: async (uid, key) => {
        state.setAvatar.push(key);
        return { userId: uid, avatar: key };
      },
    });
    setMock(PATHS.objectStorage, {
      isEnabled: () => true,
      objectExists: async () => true,
      getObjectStream: async (key) => {
        state.streamed.push(key);
        return { pipe: (res) => res };
      },
      putObject: async (key, _buf, contentType) => {
        state.put.push({ key, contentType });
      },
      deleteObject: async (key) => {
        state.deleted.push(key);
      },
    });
  }

  function req(extra = {}) {
    return { userContext: { userId: UID }, user: { id: UID }, params: { userId: UID }, headers: {}, ...extra };
  }

  afterEach(clearMocks);

  it('GET avatar with a foreign key returns 404 without streaming', async () => {
    installControllerMocks('chat/secret.pdf');
    const controller = require(PATHS.controller);
    const res = mockRes();
    await controller.getUserAvatar(req(), res);
    assert.equal(res.statusCode, 404);
    assert.equal(state.streamed.length, 0);
  });

  it('GET avatar with the owner key streams with nosniff', async () => {
    installControllerMocks(OWN_KEY);
    const controller = require(PATHS.controller);
    const res = mockRes();
    await controller.getUserAvatar(req(), res);
    assert.deepEqual(state.streamed, [OWN_KEY]);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('upload rejects SVG renamed to .png', async () => {
    installControllerMocks(OWN_KEY);
    const controller = require(PATHS.controller);
    const res = mockRes();
    await controller.uploadAvatar(
      req({ file: { buffer: SVG, originalname: 'x.png', mimetype: 'image/png' } }),
      res
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'USER_AVATAR_INVALID_IMAGE');
    assert.equal(state.put.length, 0);
  });

  it('upload stores the sniffed type and never deletes a foreign previous key', async () => {
    installControllerMocks('chat/secret.pdf');
    const controller = require(PATHS.controller);
    const res = mockRes();
    await controller.uploadAvatar(
      req({ file: { buffer: PNG, originalname: 'x.jpg', mimetype: 'image/jpeg' } }),
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(state.put[0].contentType, 'image/png');
    assert.match(state.put[0].key, new RegExp(`^users/${UID}/avatars/.+\\.png$`));
    assert.equal(state.deleted.length, 0);
  });

  it('upload deletes the previous key when it belongs to the same user', async () => {
    installControllerMocks(OWN_KEY);
    const controller = require(PATHS.controller);
    await controller.uploadAvatar(req({ file: { buffer: JPEG, originalname: 'a.jpg', mimetype: 'image/jpeg' } }), mockRes());
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(state.deleted, [OWN_KEY]);
  });
});
