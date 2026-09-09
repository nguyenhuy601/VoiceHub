const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildAiProposalActionUrl } = require('../src/utils/aiProposalActionUrl');

describe('buildAiProposalActionUrl', () => {
  it('ưu tiên Hub project', () => {
    assert.equal(
      buildAiProposalActionUrl({
        organizationId: 'o1',
        projectId: 'p1',
        boardId: 'b1',
        extractionId: 'e1',
      }),
      '/app/collaborate/projects/p1?organizationId=o1&boardId=b1&aiExtractionId=e1'
    );
  });

  it('fallback channel org', () => {
    assert.equal(
      buildAiProposalActionUrl({
        organizationId: 'o1',
        channelId: 'c1',
        extractionId: 'e1',
      }),
      '/app/collaborate/organizations/o1/channels?channelId=c1&aiExtractionId=e1'
    );
  });
});
