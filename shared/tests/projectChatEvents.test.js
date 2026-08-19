const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROJECT_CHAT_EVENT_TYPES,
  isKnownProjectChatEventType,
  buildProjectChatEventEnvelope,
  routingKeyForProjectChatType,
} = require('../messaging/projectChatEvents');

describe('projectChatEvents', () => {
  it('knows member.changed and channel.provision', () => {
    assert.equal(isKnownProjectChatEventType(PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED), true);
    assert.equal(isKnownProjectChatEventType(PROJECT_CHAT_EVENT_TYPES.CHANNEL_PROVISION), true);
    assert.equal(isKnownProjectChatEventType('project.v1.room.acl'), false);
  });

  it('builds v1 envelope with status', () => {
    const env = buildProjectChatEventEnvelope({
      type: PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED,
      eventId: 'e1',
      organizationId: 'o1',
      projectId: 'p1',
      userId: 'u1',
      status: 'active',
    });
    assert.equal(env.schemaVersion, 1);
    assert.equal(env.type, PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED);
    assert.equal(env.payload.status, 'active');
    assert.equal(env.userId, 'u1');
  });

  it('rejects unknown type', () => {
    assert.throws(() => buildProjectChatEventEnvelope({ type: 'nope' }));
  });

  it('routing key stays on member.changed', () => {
    assert.equal(
      routingKeyForProjectChatType('unknown'),
      PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED
    );
  });

  it('builds provision envelope without status', () => {
    const env = buildProjectChatEventEnvelope({
      type: PROJECT_CHAT_EVENT_TYPES.CHANNEL_PROVISION,
      eventId: 'e2',
      organizationId: 'o1',
      projectId: 'p1',
      payload: { kind: 'core', projectTitle: 'Coffee' },
    });
    assert.equal(env.type, PROJECT_CHAT_EVENT_TYPES.CHANNEL_PROVISION);
    assert.equal(env.payload.kind, 'core');
    assert.equal(env.payload.status, undefined);
    assert.equal(routingKeyForProjectChatType(env.type), PROJECT_CHAT_EVENT_TYPES.CHANNEL_PROVISION);
  });
});
