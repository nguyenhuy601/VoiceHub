const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  diffWhitelistedFields,
  diffTaskPatch,
  TASK_HISTORY_FIELDS,
  mapLogRow,
  expandLegacyUpdated,
} = require('../src/utils/workHistoryDiff');

describe('workHistoryDiff', () => {
  it('bỏ field không đổi', () => {
    const changes = diffWhitelistedFields(
      { status: 'todo', title: 'A' },
      { status: 'todo', title: 'A' },
      ['status', 'title']
    );
    assert.equal(changes.length, 0);
  });

  it('bỏ field ngoài whitelist', () => {
    const changes = diffWhitelistedFields(
      { status: 'todo', comments: [] },
      { status: 'done', comments: [{ x: 1 }] },
      ['status']
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].field, 'status');
    assert.equal(changes[0].from, 'todo');
    assert.equal(changes[0].to, 'done');
  });

  it('diffTaskPatch chỉ các key trong patch', () => {
    const changes = diffTaskPatch(
      { title: 'Old', status: 'todo', priority: 'medium' },
      { title: 'New' }
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].field, 'title');
    assert.equal(changes[0].from, 'Old');
    assert.equal(changes[0].to, 'New');
    assert.ok(TASK_HISTORY_FIELDS.includes('title'));
  });
});

describe('mapLogRow', () => {
  it('map work.field_changed', () => {
    const row = mapLogRow({
      _id: 'h1',
      actorId: 'u1',
      createdAt: '2026-08-11T00:00:00.000Z',
      type: 'work.field_changed',
      payload: { field: 'status', from: 'todo', to: 'in_progress' },
    });
    assert.equal(row.field, 'status');
    assert.equal(row.from, 'todo');
    assert.equal(row.to, 'in_progress');
  });

  it('map task.updated legacy thành từng field', () => {
    const items = expandLegacyUpdated({
      _id: 'h2',
      actorId: 'u1',
      createdAt: '2026-08-11T00:00:00.000Z',
      type: 'task.updated',
      payload: { fields: ['status', 'epicId'] },
    });
    assert.equal(items.length, 2);
    assert.equal(items[0].field, 'status');
    assert.equal(items[0].from, null);
    assert.equal(items[1].field, 'epicId');
  });
});

describe('list history enrich labels', () => {
  it('workHistory.service có enrichHistoryItemsWithLabels', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/services/workHistory.service.js'), 'utf8');
    assert.match(src, /enrichHistoryItemsWithLabels/);
    assert.match(src, /fromLabel/);
    assert.match(src, /toLabel/);
  });
});

describe('list history query select', () => {
  it('workHistory.service select cụ thể — không find() trần', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/services/workHistory.service.js'), 'utf8');
    assert.match(src, /\.select\(HISTORY_SELECT\)/);
    assert.match(src, /\.select\(TASK_META_SELECT\)/);
    assert.equal(src.includes('Task.findById(id).lean()'), false);
    assert.equal(src.includes('TaskActivityLog.find(q).sort'), false);
  });
});
