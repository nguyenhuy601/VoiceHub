const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  buildBoardCardMongoFilter,
  parseIncludeCardsFlag,
} = require('../src/utils/work/listLazyQuery');

test('parseIncludeCardsFlag: mặc định true', () => {
  assert.equal(parseIncludeCardsFlag(undefined), true);
  assert.equal(parseIncludeCardsFlag('0'), false);
  assert.equal(parseIncludeCardsFlag('false'), false);
});

test('buildBoardCardMongoFilter: parentTaskId ưu tiên', () => {
  const boardId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const parentTaskId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  const filter = buildBoardCardMongoFilter(
    { boardId, parentTaskId, featureId: 'cccccccccccccccccccccccc', epicId: 'dddddddddddddddddddddddd' },
    { isValidOid: () => true, toOid: (id) => id }
  );
  assert.equal(filter.parentTaskId, parentTaskId);
  assert.equal(filter.featureId, undefined);
  assert.equal(filter.epicId, undefined);
});
