const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DELETE_ACCESS,
  isOrgRoomMessage,
  resolveRoomDeleteAccess,
  buildDeleteFilter,
} = require('../src/utils/messageMutationPolicy');

describe('resolveRoomDeleteAccess', () => {
  it('sender có canRead xóa được tin của mình', () => {
    assert.equal(
      resolveRoomDeleteAccess({ isSender: true, perms: { canRead: true } }),
      DELETE_ACCESS.SENDER
    );
  });

  it('sender mất canRead bị từ chối', () => {
    assert.equal(resolveRoomDeleteAccess({ isSender: true, perms: { canDelete: true } }), null);
  });

  it('không phải sender nhưng có canDelete → moderator', () => {
    assert.equal(
      resolveRoomDeleteAccess({ isSender: false, perms: { canRead: true, canDelete: true } }),
      DELETE_ACCESS.MODERATOR
    );
  });

  it('không phải sender, không canDelete → null', () => {
    assert.equal(
      resolveRoomDeleteAccess({ isSender: false, perms: { canRead: true, canWrite: true } }),
      null
    );
  });

  it('thiếu perms → null', () => {
    assert.equal(resolveRoomDeleteAccess({ isSender: false }), null);
  });
});

describe('buildDeleteFilter', () => {
  it('mặc định ràng buộc senderId và bỏ qua tin đã xóa', () => {
    assert.deepEqual(buildDeleteFilter({ messageId: 'm1', userId: 'u1' }), {
      _id: 'm1',
      isDeleted: { $ne: true },
      senderId: 'u1',
    });
  });

  it('moderator không ràng buộc senderId', () => {
    const filter = buildDeleteFilter({ messageId: 'm1', userId: 'u1', asModerator: true });
    assert.deepEqual(filter, { _id: 'm1', isDeleted: { $ne: true } });
  });
});

describe('isOrgRoomMessage', () => {
  it('cần cả organizationId và roomId', () => {
    assert.equal(isOrgRoomMessage({ organizationId: 'o', roomId: 'r' }), true);
    assert.equal(isOrgRoomMessage({ roomId: 'r' }), false);
    assert.equal(isOrgRoomMessage({ receiverId: 'u' }), false);
    assert.equal(isOrgRoomMessage(null), false);
  });
});

describe('message.controller wiring (source contract)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/controllers/message.controller.js'),
    'utf8'
  );

  const sliceMethod = (name) => {
    const start = src.indexOf(`  async ${name}(req, res) {`);
    assert.ok(start > 0, `missing ${name}`);
    const next = src.indexOf('\n  async ', start + 10);
    return src.slice(start, next > 0 ? next : undefined);
  };

  it('deleteMessage dùng policy và truyền asModerator', () => {
    const body = sliceMethod('deleteMessage');
    assert.match(body, /resolveRoomDeleteAccess/);
    assert.match(body, /deleteMessage\(messageId, userId, \{ asModerator \}\)/);
  });

  it('editMessage + recallMessage kiểm canWrite trước khi gọi service', () => {
    for (const name of ['editMessage', 'recallMessage']) {
      const body = sliceMethod(name);
      const guard = body.indexOf('rejectRoomMutationWithoutWrite');
      const call = body.indexOf(`messageService.${name}(`);
      assert.ok(guard > 0 && call > guard, `${name} phải guard trước service`);
    }
  });

  it('editMessage 400 có errorCode CHAT_VALIDATION_ERROR', () => {
    assert.match(sliceMethod('editMessage'), /CHAT_VALIDATION_ERROR/);
  });
});
