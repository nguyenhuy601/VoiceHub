const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { isPublishEnabled } = require('../src/utils/projectChatPublishFlags');
const { PROJECT_CHAT_EVENT_TYPES } = require('../../../shared/messaging/projectChatEvents');

describe('projectChatPublishFlags', () => {
  const prev = process.env.PROJECT_CHAT_EVENT_PUBLISH;

  afterEach(() => {
    if (prev === undefined) delete process.env.PROJECT_CHAT_EVENT_PUBLISH;
    else process.env.PROJECT_CHAT_EVENT_PUBLISH = prev;
  });

  it('defaults on', () => {
    delete process.env.PROJECT_CHAT_EVENT_PUBLISH;
    assert.equal(isPublishEnabled(), true);
  });

  it('can disable', () => {
    process.env.PROJECT_CHAT_EVENT_PUBLISH = '0';
    assert.equal(isPublishEnabled(), false);
  });

  it('exports channel.provision type', () => {
    assert.equal(PROJECT_CHAT_EVENT_TYPES.CHANNEL_PROVISION, 'project.v1.channel.provision');
  });
});
