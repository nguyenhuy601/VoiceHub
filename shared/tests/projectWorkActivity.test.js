const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  selectAnnouncementChanges,
  buildWorkActivityContent,
  ANNOUNCEMENT_FIELDS,
} = require('../messaging/projectWorkActivity');

describe('projectWorkActivity', () => {
  it('exposes significant fields only', () => {
    assert.ok(ANNOUNCEMENT_FIELDS.includes('status'));
    assert.ok(ANNOUNCEMENT_FIELDS.includes('assigneeId'));
    assert.equal(ANNOUNCEMENT_FIELDS.includes('title'), false);
    assert.equal(ANNOUNCEMENT_FIELDS.includes('estimateHours'), false);
  });

  it('drops listId when status also present', () => {
    const out = selectAnnouncementChanges([
      { field: 'status', from: 'todo', to: 'done' },
      { field: 'listId', from: 'a', to: 'b' },
      { field: 'title', from: 'x', to: 'y' },
    ]);
    assert.deepEqual(
      out.map((c) => c.field),
      ['status']
    );
  });

  it('builds content with from→to', () => {
    const text = buildWorkActivityContent({
      field: 'status',
      label: 'HT-ABCD',
      actorLabel: 'Nam',
      from: 'In Progress',
      to: 'Ready for QA',
    });
    assert.match(text, /Nam đã chuyển trạng thái HT-ABCD/);
    assert.match(text, /In Progress/);
    assert.match(text, /Ready for QA/);
  });
});
