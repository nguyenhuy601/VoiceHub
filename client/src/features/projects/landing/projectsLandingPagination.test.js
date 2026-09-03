import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginateList, PROJECTS_LANDING_PAGE_SIZE } from './projectsLandingPagination.js';

test('paginateList returns 4 items on first page', () => {
  const items = [1, 2, 3, 4, 5, 6];
  const page1 = paginateList(items, 1);
  assert.equal(PROJECTS_LANDING_PAGE_SIZE, 4);
  assert.deepEqual(page1.items, [1, 2, 3, 4]);
  assert.equal(page1.page, 1);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.showPager, true);

  const page2 = paginateList(items, 2);
  assert.deepEqual(page2.items, [5, 6]);
  assert.equal(page2.page, 2);
});

test('paginateList clamps invalid page and hides pager when small list', () => {
  const small = paginateList(['a', 'b'], 99);
  assert.deepEqual(small.items, ['a', 'b']);
  assert.equal(small.page, 1);
  assert.equal(small.totalPages, 1);
  assert.equal(small.showPager, false);

  const empty = paginateList([], 1);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.page, 1);
  assert.equal(empty.showPager, false);
});
