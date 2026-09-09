import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldLabel, formatAuditValue } from './auditLogDisplay.js';

const LABELS = {
  'adminAudit.emptyValue': '—',
  'adminAudit.redacted': '[đã ẩn]',
  'adminAudit.workTypeOrder': 'Thứ tự loại việc: {order}',
  'adminAudit.workTypeHidden': 'Ẩn: {names}',
  'adminAudit.workTypeNoneHidden': 'Không ẩn loại nào',
  'adminAudit.fieldWorkTypeConfig': 'Loại việc',
  'workspace.projectHubIssueTypeEpic': 'Epic',
  'workspace.projectHubIssueTypeFeature': 'Feature',
  'workspace.projectHubIssueTypeStory': 'Story',
  'workspace.projectHubIssueTypeTask': 'Task',
  'workspace.projectHubIssueTypeBug': 'Bug',
  'workspace.projectHubIssueTypeSubtask': 'Sub-task',
};

function t(path, vars) {
  let s = LABELS[path] || path;
  if (vars) {
    s = s.replace(/\{(\w+)\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : ''));
  }
  return s;
}

const sampleConfig = {
  treeOrder: ['epic', 'feature', 'story', 'task', 'bug', 'subtask'],
  depthById: { epic: 0, feature: 1, story: 2, task: 2, bug: 2, subtask: 3 },
  createOrder: ['story', 'task', 'bug'],
  hidden: { epic: false, feature: false, story: false, task: false, bug: true, subtask: false },
};

test('workTypeConfig object becomes human order, not JSON', () => {
  const text = formatAuditValue(sampleConfig, t, 'vi', 'workTypeConfig');
  assert.equal(text, 'Thứ tự loại việc: Epic → Feature → Story → Task → Bug → Sub-task. Ẩn: Bug');
  assert.ok(!text.includes('{'));
  assert.ok(!text.includes('treeOrder'));
});

test('workTypeConfig without hidden types omits hidden clause', () => {
  const text = formatAuditValue(
    { ...sampleConfig, hidden: { epic: false, bug: false } },
    t,
    'vi',
    'workTypeConfig'
  );
  assert.equal(text, 'Thứ tự loại việc: Epic → Feature → Story → Task → Bug → Sub-task');
});

test('treeOrder array uses issue type labels', () => {
  assert.equal(formatAuditValue(['epic', 'story'], t, 'vi', 'treeOrder'), 'Epic → Story');
});

test('depthById map is labeled levels, not JSON', () => {
  const text = formatAuditValue({ epic: 0, feature: 1 }, t, 'vi', 'depthById');
  assert.equal(text, 'Epic (0) → Feature (1)');
});

test('unrelated objects still stringify', () => {
  const text = formatAuditValue({ foo: 1, bar: 'x' }, t, 'vi', 'meta');
  assert.equal(text, '{"foo":1,"bar":"x"}');
});

test('field label for workTypeConfig', () => {
  assert.equal(fieldLabel(t, 'workTypeConfig'), 'Loại việc');
});
