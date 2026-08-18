const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseIncludeCardsFlag,
  buildPlanningListFilter,
  buildBoardCardMongoFilter,
} = require('../src/utils/listLazyQuery');

const OID = '507f1f77bcf86cd799439011';

describe('parseIncludeCardsFlag', () => {
  it('T2 mặc định true; 0/false → false', () => {
    assert.equal(parseIncludeCardsFlag(undefined), true);
    assert.equal(parseIncludeCardsFlag(''), true);
    assert.equal(parseIncludeCardsFlag('1'), true);
    assert.equal(parseIncludeCardsFlag('0'), false);
    assert.equal(parseIncludeCardsFlag('false'), false);
  });
});

describe('buildPlanningListFilter T1', () => {
  it('type=epic only', () => {
    const f = buildPlanningListFilter({ projectId: 'p1', type: 'epic' });
    assert.equal(f.projectId, 'p1');
    assert.equal(f.isActive, true);
    assert.equal(f.type, 'epic');
    assert.equal(f.parentId, undefined);
  });

  it('type=feature + parentId', () => {
    const f = buildPlanningListFilter({ projectId: 'p1', type: 'feature', parentId: OID });
    assert.equal(f.type, 'feature');
    assert.equal(f.parentId, OID);
  });

  it('type lạ / parentId sai → 400', () => {
    assert.throws(() => buildPlanningListFilter({ projectId: 'p1', type: 'task' }), (e) => e.statusCode === 400);
    assert.throws(
      () => buildPlanningListFilter({ projectId: 'p1', parentId: 'nope' }),
      (e) => e.statusCode === 400
    );
  });
});

describe('buildBoardCardMongoFilter T3', () => {
  const boardId = 'board-1';

  it('không filter → all active', () => {
    assert.deepEqual(buildBoardCardMongoFilter({ boardId }), { boardId, isActive: true });
  });

  it('parentTaskId chỉ con trực tiếp', () => {
    const f = buildBoardCardMongoFilter({ boardId, parentTaskId: OID });
    assert.equal(f.parentTaskId, OID);
    assert.equal(f.epicId, undefined);
  });

  it('featureId không kèm parentTaskId', () => {
    const f = buildBoardCardMongoFilter({ boardId, featureId: OID });
    assert.equal(f.featureId, OID);
    assert.ok(Array.isArray(f.$or));
    assert.ok(f.$or.some((c) => c.parentTaskId === null));
  });

  it('epicId không parentTaskId + không featureId', () => {
    const f = buildBoardCardMongoFilter({ boardId, epicId: OID });
    assert.equal(f.epicId, OID);
    assert.equal(f.$and.length, 2);
  });

  it('ưu tiên parentTaskId hơn epicId', () => {
    const f = buildBoardCardMongoFilter({ boardId, epicId: OID, parentTaskId: OID });
    assert.equal(f.parentTaskId, OID);
    assert.equal(f.epicId, undefined);
  });

  it('oid không hợp lệ → 400', () => {
    assert.throws(
      () => buildBoardCardMongoFilter({ boardId, epicId: 'bad' }),
      (e) => e.statusCode === 400
    );
  });
});
