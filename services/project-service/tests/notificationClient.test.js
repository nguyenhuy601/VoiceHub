const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  uniqueUserIds,
  projectHubActionUrl,
  assigneeIdChanged,
  planningWorkLabel,
} = require('../src/utils/notificationTargets');

describe('uniqueUserIds', () => {
  it('dedupe và loại actor', () => {
    assert.deepEqual(uniqueUserIds(['a', 'a', 'b', ''], 'a'), ['b']);
    assert.deepEqual(uniqueUserIds(['x'], 'x'), []);
  });
});

describe('projectHubActionUrl', () => {
  it('fallback list khi thiếu projectId', () => {
    assert.equal(projectHubActionUrl({}), '/app/collaborate/projects');
  });

  it('gắn organizationId và boardId', () => {
    assert.equal(
      projectHubActionUrl({
        projectId: 'p1',
        organizationId: 'o1',
        boardId: 'b1',
      }),
      '/app/collaborate/projects/p1?organizationId=o1&boardId=b1'
    );
  });
});

describe('assigneeIdChanged', () => {
  it('chỉ true khi có người mới khác người cũ', () => {
    assert.equal(assigneeIdChanged(null, 'u2'), true);
    assert.equal(assigneeIdChanged('u1', 'u2'), true);
    assert.equal(assigneeIdChanged('u1', 'u1'), false);
    assert.equal(assigneeIdChanged('u1', null), false);
    assert.equal(assigneeIdChanged('', ''), false);
  });
});

describe('planningWorkLabel', () => {
  it('map type planning sang nhãn inbox', () => {
    assert.equal(planningWorkLabel('epic'), 'Epic');
    assert.equal(planningWorkLabel('feature'), 'Feature');
    assert.equal(planningWorkLabel('unknown'), 'Work');
  });
});
