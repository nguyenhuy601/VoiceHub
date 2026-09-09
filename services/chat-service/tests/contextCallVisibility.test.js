const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseVisibility,
  viewerCanSeePayload,
  mongoVisibilityFilter,
  meiliVisibilityFilter,
  mergeMongoFilter,
  MODE_PROJECT_INTERSECTION,
  isContextCallEnabled,
  isContextVisibleToRoom,
} = require('../src/utils/contextCallVisibility');

describe('contextCallVisibility', () => {
  it('parses project_intersection', () => {
    const vis = parseVisibility({
      mode: MODE_PROJECT_INTERSECTION,
      projectId: 'p1',
      projectName: 'Alpha',
    });
    assert.equal(vis.projectId, 'p1');
    assert.equal(vis.projectName, 'Alpha');
  });

  it('rejects incomplete visibility', () => {
    assert.equal(parseVisibility({ mode: MODE_PROJECT_INTERSECTION }), null);
    assert.equal(parseVisibility({ projectId: 'p1' }), null);
  });

  it('viewer sees payload only with matching project when room-visible is off', () => {
    const vis = { mode: MODE_PROJECT_INTERSECTION, projectId: 'p1' };
    const prev = process.env.ORG_CONTEXT_VISIBLE_TO_ROOM;
    process.env.ORG_CONTEXT_VISIBLE_TO_ROOM = '0';
    try {
      assert.equal(viewerCanSeePayload(vis, ['p1', 'p2']), true);
      assert.equal(viewerCanSeePayload(vis, ['p9']), false);
      assert.equal(viewerCanSeePayload(vis, []), false);
      assert.equal(viewerCanSeePayload(null, []), true);
    } finally {
      if (prev === undefined) delete process.env.ORG_CONTEXT_VISIBLE_TO_ROOM;
      else process.env.ORG_CONTEXT_VISIBLE_TO_ROOM = prev;
    }
  });

  it('viewer sees context payload for whole room when ORG_CONTEXT_VISIBLE_TO_ROOM is on', () => {
    const vis = { mode: MODE_PROJECT_INTERSECTION, projectId: 'p1' };
    const prev = process.env.ORG_CONTEXT_VISIBLE_TO_ROOM;
    process.env.ORG_CONTEXT_VISIBLE_TO_ROOM = 'true';
    try {
      assert.equal(viewerCanSeePayload(vis, []), true);
      assert.equal(viewerCanSeePayload(vis, ['p9']), true);
    } finally {
      if (prev === undefined) delete process.env.ORG_CONTEXT_VISIBLE_TO_ROOM;
      else process.env.ORG_CONTEXT_VISIBLE_TO_ROOM = prev;
    }
  });

  it('mongo filter includes intersection or non-context', () => {
    const f = mongoVisibilityFilter(['p1']);
    assert.ok(Array.isArray(f.$or));
    assert.deepEqual(f.$or[2], { 'visibility.projectId': { $in: ['p1'] } });
  });

  it('empty membership hides context cards (T3 C / T4 inactive)', () => {
    const f = mongoVisibilityFilter([]);
    assert.deepEqual(f.$or[2], { 'visibility.projectId': { $in: [] } });
    const merged = mergeMongoFilter({ roomId: 'r1' }, f);
    assert.ok(Array.isArray(merged.$and));
    assert.equal(merged.$and.length, 2);
  });

  it('meili filter fail-closed when no projects', () => {
    assert.equal(
      meiliVisibilityFilter([]),
      `visibilityMode != "${MODE_PROJECT_INTERSECTION}"`
    );
    assert.match(meiliVisibilityFilter(['p1']), /visibilityProjectId IN \["p1"\]/);
  });

  it('ORG_CONTEXT_CALL=0 disables feature', () => {
    const prev = process.env.ORG_CONTEXT_CALL;
    process.env.ORG_CONTEXT_CALL = '0';
    try {
      assert.equal(isContextCallEnabled(), false);
    } finally {
      if (prev === undefined) delete process.env.ORG_CONTEXT_CALL;
      else process.env.ORG_CONTEXT_CALL = prev;
    }
  });

  it('ORG_CONTEXT_VISIBLE_TO_ROOM defaults on; 0 restores hide-message filter', () => {
    const prev = process.env.ORG_CONTEXT_VISIBLE_TO_ROOM;
    try {
      delete process.env.ORG_CONTEXT_VISIBLE_TO_ROOM;
      assert.equal(isContextVisibleToRoom(), true);
      process.env.ORG_CONTEXT_VISIBLE_TO_ROOM = '0';
      assert.equal(isContextVisibleToRoom(), false);
    } finally {
      if (prev === undefined) delete process.env.ORG_CONTEXT_VISIBLE_TO_ROOM;
      else process.env.ORG_CONTEXT_VISIBLE_TO_ROOM = prev;
    }
  });
});
