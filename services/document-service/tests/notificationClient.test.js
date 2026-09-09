const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { documentActionUrl } = require('../src/utils/documentActionUrl');

describe('documentActionUrl', () => {
  it('trả path Collaborate documents', () => {
    assert.equal(
      documentActionUrl({ documentId: 'd1', organizationId: 'o1' }),
      '/app/collaborate/documents?organizationId=o1&documentId=d1'
    );
    assert.equal(documentActionUrl({}), '/app/collaborate/documents');
  });
});
