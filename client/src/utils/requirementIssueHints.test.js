import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupIssuesBySheet,
  rowsWithIssues,
  listIssueSheetNames,
  getIssueFixHint,
  resolveSeverityFilter,
  formatRowIssueHints,
} from './requirementIssueHints.js';

const t = (key) => {
  const map = {
    'requirements.issueHints._default': 'Default hint',
    'requirements.issueHints.REQ_FR_INVALID_LEVEL': 'Fix level',
  };
  return map[key] ?? key;
};

test('groupIssuesBySheet filters by severity', () => {
  const issues = [
    { sheet: '03_Functional_Requirements', row: 3, severity: 'error', code: 'A' },
    { sheet: '03_Functional_Requirements', row: 4, severity: 'warning', code: 'B' },
    { sheet: '04_Non_Functional', row: null, severity: 'error', code: 'C' },
  ];
  const errors = groupIssuesBySheet(issues, 'error');
  assert.equal(errors.size, 2);
  assert.equal(errors.get('03_Functional_Requirements').length, 1);
  assert.equal(errors.get('04_Non_Functional').length, 1);
});

test('rowsWithIssues returns row numbers for sheet', () => {
  const issues = [
    { sheet: 'S1', row: 3, severity: 'error' },
    { sheet: 'S1', row: 5, severity: 'error' },
    { sheet: 'S2', row: 2, severity: 'error' },
  ];
  const rows = rowsWithIssues(issues, 'S1', 'error');
  assert.deepEqual([...rows].sort(), [3, 5]);
});

test('listIssueSheetNames preserves excel preview order', () => {
  const issues = [
    { sheet: 'B', row: 1, severity: 'error' },
    { sheet: 'A', row: 2, severity: 'error' },
  ];
  const excelPreview = { sheets: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] };
  assert.deepEqual(listIssueSheetNames(issues, excelPreview, 'error'), ['A', 'B']);
});

test('getIssueFixHint falls back to default', () => {
  assert.equal(getIssueFixHint('REQ_FR_INVALID_LEVEL', t), 'Fix level');
  assert.equal(getIssueFixHint('REQ_UNKNOWN', t), 'Default hint');
});

test('resolveSeverityFilter prefers errors then warnings then info', () => {
  assert.equal(resolveSeverityFilter(2, 5), 'error');
  assert.equal(resolveSeverityFilter(0, 3), 'warning');
  assert.equal(resolveSeverityFilter(0, 0, 2), 'info');
  assert.equal(resolveSeverityFilter(0, 0, 0), null);
});

test('formatRowIssueHints dedupes by code', () => {
  const lines = formatRowIssueHints(
    [
      { code: 'REQ_FR_INVALID_LEVEL', message: 'bad level', severity: 'error' },
      { code: 'REQ_FR_INVALID_LEVEL', message: 'dup', severity: 'error' },
    ],
    t
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].hint, 'Fix level');
});
