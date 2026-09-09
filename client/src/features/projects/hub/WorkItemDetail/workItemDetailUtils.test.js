import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HISTORY_FIELD_I18N,
  buildWorkItemDatePatch,
  dateInputValueFromIso,
  formatHistoryDisplay,
  historySideLabel,
  isoDateFromDateInput,
  isNoopHistoryRow,
  looksLikeObjectId,
  resolveHistoryValue,
  resolveWorkItemDueDate,
  resolveWorkItemStartDate,
} from './workItemDetailUtils.js';

const members = [
  {
    userId: '6a50cf8e118b7faac2f6ae0c',
    displayName: 'Bùi Mai',
    avatar: '',
  },
  {
    userId: '6a55f2ee9789f7216c06074f',
    displayName: 'Nguyên Huy',
  },
];

const lists = [
  { _id: '6a8816be602c49c94c770b1b', title: 'To Do', statusKey: 'todo' },
  { _id: '6a8816be602c49c94c770b1c', title: 'Done', statusKey: 'done' },
];

const ctx = { members, lists };

test('looksLikeObjectId', () => {
  assert.equal(looksLikeObjectId('6a8816be602c49c94c770b1b'), true);
  assert.equal(looksLikeObjectId('todo'), false);
});

test('resolveHistoryValue assigneeId → displayName', () => {
  assert.equal(
    resolveHistoryValue('assigneeId', '6a50cf8e118b7faac2f6ae0c', ctx),
    'Bùi Mai'
  );
  assert.equal(
    resolveHistoryValue('assigneeId', '6a55f2ee9789f7216c06074f', ctx),
    'Nguyên Huy'
  );
});

test('resolveHistoryValue listId → list title', () => {
  assert.equal(resolveHistoryValue('listId', '6a8816be602c49c94c770b1b', ctx), 'To Do');
  assert.equal(resolveHistoryValue('listId', '6a8816be602c49c94c770b1c', ctx), 'Done');
});

test('resolveHistoryValue status → list title hoặc STATUS_LABELS', () => {
  assert.equal(resolveHistoryValue('status', 'todo', ctx), 'To Do');
  assert.equal(resolveHistoryValue('status', 'done', ctx), 'Done');
  assert.equal(resolveHistoryValue('status', 'in_progress', {}), 'In Progress');
});

test('resolveHistoryValue trống → null', () => {
  assert.equal(resolveHistoryValue('assigneeId', null, ctx), null);
  assert.equal(resolveHistoryValue('assigneeId', '', ctx), null);
  assert.equal(resolveHistoryValue('assignments', [], ctx), null);
});

test('historySideLabel ưu tiên fromLabel/toLabel', () => {
  const row = {
    field: 'assigneeId',
    from: '6a55f2ee9789f7216c06074f',
    to: '6a50cf8e118b7faac2f6ae0c',
    fromLabel: 'Alice',
    toLabel: 'Bob',
  };
  assert.equal(historySideLabel(row, 'from', ctx), 'Alice');
  assert.equal(historySideLabel(row, 'to', ctx), 'Bob');
});

test('isNoopHistoryRow ẩn None→None và from===to', () => {
  assert.equal(isNoopHistoryRow({ field: 'assigneeId', from: null, to: null }, ctx), true);
  assert.equal(isNoopHistoryRow({ field: 'assignments', from: null, to: null }, ctx), true);
  assert.equal(
    isNoopHistoryRow(
      {
        field: 'assigneeId',
        from: '6a50cf8e118b7faac2f6ae0c',
        to: '6a50cf8e118b7faac2f6ae0c',
      },
      ctx
    ),
    true
  );
  assert.equal(
    isNoopHistoryRow(
      {
        field: 'listId',
        from: '6a8816be602c49c94c770b1b',
        to: '6a8816be602c49c94c770b1c',
      },
      ctx
    ),
    false
  );
  assert.equal(isNoopHistoryRow({ field: 'issue', from: null, to: 'Task' }, ctx), false);
});

test('formatHistoryDisplay + assignments i18n key', () => {
  assert.equal(formatHistoryDisplay(null, 'None'), 'None');
  assert.equal(formatHistoryDisplay('Bùi Mai', 'None'), 'Bùi Mai');
  assert.equal(HISTORY_FIELD_I18N.assignments, 'workspace.projectHubWorkFieldAssignee');
});

test('resolveWorkItemDueDate planning ưu tiên targetDate', () => {
  assert.equal(
    resolveWorkItemDueDate(
      { kind: 'planning', targetDate: '2026-09-01', dueDate: '2026-08-01' },
      { isPlanning: true }
    ),
    '2026-09-01'
  );
  assert.equal(
    resolveWorkItemDueDate({ kind: 'planning', dueDate: '2026-08-15' }, { isPlanning: true }),
    '2026-08-15'
  );
  assert.equal(resolveWorkItemDueDate({ dueDate: '2026-08-20' }, { isPlanning: false }), '2026-08-20');
});

test('resolveWorkItemStartDate', () => {
  assert.equal(resolveWorkItemStartDate({ startDate: '2026-08-26' }), '2026-08-26');
  assert.equal(resolveWorkItemStartDate({}), null);
});

test('isoDateFromDateInput giữ đúng ngày lịch (UTC noon)', () => {
  const iso = isoDateFromDateInput('2026-08-26');
  assert.equal(iso, '2026-08-26T12:00:00.000Z');
  assert.equal(dateInputValueFromIso(iso), '2026-08-26');
  assert.equal(isoDateFromDateInput(''), null);
  assert.equal(isoDateFromDateInput(null), null);
});

test('buildWorkItemDatePatch planning đồng bộ targetDate + dueDate', () => {
  const patch = buildWorkItemDatePatch({
    isPlanning: true,
    startDate: '2026-08-26',
    dueDate: '2026-09-01',
  });
  assert.equal(patch.startDate, '2026-08-26T12:00:00.000Z');
  assert.equal(patch.targetDate, '2026-09-01T12:00:00.000Z');
  assert.equal(patch.dueDate, '2026-09-01T12:00:00.000Z');
});

test('buildWorkItemDatePatch card chỉ dueDate', () => {
  const patch = buildWorkItemDatePatch({
    isPlanning: false,
    dueDate: '2026-08-30',
  });
  assert.equal(patch.dueDate, '2026-08-30T12:00:00.000Z');
  assert.equal(patch.targetDate, undefined);
});
