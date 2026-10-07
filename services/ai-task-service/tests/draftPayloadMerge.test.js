const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mergeProjectDraftPayload } = require('../src/utils/draftPayloadMerge');

describe('mergeProjectDraftPayload', () => {
  const base = {
    title: 'Old',
    description: 'D',
    projectCode: 'P1',
    dueDate: null,
    visibility: 'workspace',
    scopeType: 'department',
    scopeId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    organizationId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    lists: [{ title: 'Todo', kind: 'status', teamId: null }],
  };

  it('allows safe field edits', () => {
    const out = mergeProjectDraftPayload(base, {
      title: 'New',
      description: 'Desc',
      projectCode: 'P2',
      lists: [{ title: 'Doing' }],
    });
    assert.equal(out.title, 'New');
    assert.equal(out.lists[0].title, 'Doing');
  });

  it('blocks scope/org/visibility overwrite', () => {
    const out = mergeProjectDraftPayload(base, {
      visibility: 'private',
      scopeType: 'team',
      scopeId: 'cccccccccccccccccccccccc',
      organizationId: 'dddddddddddddddddddddddd',
    });
    assert.equal(out.visibility, 'workspace');
    assert.equal(out.scopeType, 'department');
    assert.equal(out.scopeId, 'aaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(out.organizationId, 'bbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('returns base when client payload missing', () => {
    const out = mergeProjectDraftPayload(base, null);
    assert.equal(out.title, 'Old');
  });
});
