const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMessageSearchDocument,
  isOrgIndexableMessage,
  hasMessageAttachment,
} = require('../src/search/messageSearchDocument');

describe('messageSearchDocument', () => {
  it('isOrgIndexableMessage requires organizationId and roomId', () => {
    assert.equal(isOrgIndexableMessage(null), false);
    assert.equal(isOrgIndexableMessage({ organizationId: 'o1' }), false);
    assert.equal(isOrgIndexableMessage({ roomId: 'r1' }), false);
    assert.equal(isOrgIndexableMessage({ organizationId: 'o1', roomId: 'r1' }), true);
  });

  it('hasMessageAttachment for file/image type or storagePath', () => {
    assert.equal(hasMessageAttachment({ messageType: 'file' }), true);
    assert.equal(hasMessageAttachment({ messageType: 'image' }), true);
    assert.equal(hasMessageAttachment({ messageType: 'text' }), false);
    assert.equal(
      hasMessageAttachment({ messageType: 'text', fileMeta: { storagePath: 'a/b' } }),
      true
    );
  });

  it('buildMessageSearchDocument maps core fields and PK messageId', () => {
    const created = new Date('2026-01-15T10:00:00.000Z');
    const doc = {
      _id: '507f1f77bcf86cd799439011',
      organizationId: 'org1',
      roomId: 'room1',
      senderId: { _id: 'user1' },
      senderDisplayName: 'Alice',
      content: '  hello search  ',
      messageType: 'text',
      visibility: { mode: 'project_intersection', projectId: 'p1' },
      createdAt: created,
      isDeleted: false,
      isRecalled: false,
    };

    const out = buildMessageSearchDocument(doc);
    assert.equal(out.messageId, '507f1f77bcf86cd799439011');
    assert.equal(out.organizationId, 'org1');
    assert.equal(out.roomId, 'room1');
    assert.equal(out.senderId, 'user1');
    assert.equal(out.senderDisplayName, 'Alice');
    assert.equal(out.content, 'hello search');
    assert.equal(out.messageType, 'text');
    assert.equal(out.hasAttachment, false);
    assert.deepEqual(out.attachmentNames, []);
    assert.equal(out.visibilityMode, 'project_intersection');
    assert.equal(out.visibilityProjectId, 'p1');
    assert.equal(out.createdAt, created.getTime());
    assert.equal(out.isDeleted, false);
    assert.equal(out.isRecalled, false);
  });

  it('buildMessageSearchDocument includes attachment name and flags', () => {
    const out = buildMessageSearchDocument({
      id: 'm2',
      organizationId: 'o',
      roomId: 'r',
      senderId: 's1',
      messageType: 'file',
      content: 'see file',
      fileMeta: { originalName: 'spec.pdf', storagePath: 'org/x' },
      isDeleted: true,
      isRecalled: true,
    });
    assert.equal(out.messageId, 'm2');
    assert.equal(out.hasAttachment, true);
    assert.deepEqual(out.attachmentNames, ['spec.pdf']);
    assert.equal(out.isDeleted, true);
    assert.equal(out.isRecalled, true);
  });

  it('buildMessageSearchDocument uses toObject when present', () => {
    const out = buildMessageSearchDocument({
      toObject() {
        return {
          _id: 'm3',
          organizationId: 'o',
          roomId: 'r',
          content: 'via toObject',
        };
      },
    });
    assert.equal(out.messageId, 'm3');
    assert.equal(out.content, 'via toObject');
  });
});
