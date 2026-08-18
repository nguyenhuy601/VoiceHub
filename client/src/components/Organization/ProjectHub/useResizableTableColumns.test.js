import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildGridTemplate,
  clampColWidth,
  parseStoredWidths,
  widthsFromColumns,
} from './resizableTableColumns.js';

const COLS = [
  { id: 'work', minPx: 120, defaultPx: 224 },
  { id: 'status', minPx: 64, defaultPx: 96 },
];

test('clampColWidth: không dưới min; NaN → min', () => {
  assert.equal(clampColWidth(200, 80), 200);
  assert.equal(clampColWidth(10, 80), 80);
  assert.equal(clampColWidth('x', 80), 80);
  assert.equal(clampColWidth(undefined, 40), 40);
});

test('clampColWidth: tôn trọng max; max < min → min', () => {
  assert.equal(clampColWidth(400, 80, 240), 240);
  assert.equal(clampColWidth(100, 80, 240), 100);
  assert.equal(clampColWidth(10, 80, 240), 80);
  assert.equal(clampColWidth(400, 80, 50), 80);
  assert.equal(clampColWidth(200, 80, Infinity), 200);
  assert.equal(clampColWidth(200, 80, 'x'), 200);
});

test('parseStoredWidths: JSON hỏng / không object → {}', () => {
  assert.deepEqual(parseStoredWidths(null), {});
  assert.deepEqual(parseStoredWidths('{'), {});
  assert.deepEqual(parseStoredWidths('[]'), {});
  assert.deepEqual(parseStoredWidths('{"work":180,"status":"nope"}'), { work: 180 });
});

test('widthsFromColumns: merge stored + clamp min', () => {
  const stored = parseStoredWidths('{"work":50,"status":140}');
  const widths = widthsFromColumns(COLS, stored);
  assert.equal(widths.work, 120);
  assert.equal(widths.status, 140);
});

test('buildGridTemplate: px nối', () => {
  const widths = { work: 200, status: 96 };
  assert.equal(buildGridTemplate(COLS, widths), '200px 96px');
});
