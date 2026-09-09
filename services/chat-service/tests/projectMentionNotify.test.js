const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildProjectMentionActionUrl } = require('../src/utils/projectMentionActionUrl');

describe('buildProjectMentionActionUrl', () => {
  it('ưu tiên Hub project + tab chat', () => {
    assert.equal(
      buildProjectMentionActionUrl({
        organizationId: 'o1',
        roomId: 'r1',
        projectId: 'p1',
      }),
      '/app/collaborate/projects/p1?organizationId=o1&tab=chat&channelId=r1'
    );
  });

  it('fallback channel org', () => {
    assert.equal(
      buildProjectMentionActionUrl({ organizationId: 'o1', roomId: 'r1' }),
      '/app/collaborate/organizations/o1/channels?channelId=r1'
    );
  });
});
