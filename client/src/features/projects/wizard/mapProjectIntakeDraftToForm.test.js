import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapProjectIntakeDraftToForm } from './mapProjectIntakeDraftToForm.js';

describe('mapProjectIntakeDraftToForm', () => {
  it('maps non-empty draft fields and regenerates code when untouched', () => {
    const partial = mapProjectIntakeDraftToForm(
      { projectCodeTouched: false, projectType: 'software', category: 'internal', startDate: '2026-01-01' },
      {
        title: 'Portal X',
        description: 'Objective\nShip',
        priority: 'high',
        dueDate: '2026-12-30',
        customerName: 'Acme',
      }
    );
    assert.equal(partial.title, 'Portal X');
    assert.equal(partial.description, 'Objective\nShip');
    assert.equal(partial.priority, 'high');
    assert.equal(partial.dueDate, '2026-12-30');
    assert.equal(partial.customerName, 'Acme');
    assert.ok(partial.projectCode);
    assert.equal(partial.projectType, undefined);
    assert.equal(partial.category, undefined);
    assert.equal(partial.startDate, undefined);
  });

  it('keeps projectCode when projectCodeTouched', () => {
    const partial = mapProjectIntakeDraftToForm(
      { projectCodeTouched: true, projectCode: 'KEEP-ME' },
      { title: 'New Title' }
    );
    assert.equal(partial.title, 'New Title');
    assert.equal(partial.projectCode, undefined);
  });

  it('ignores empty / invalid draft values', () => {
    const partial = mapProjectIntakeDraftToForm(
      {},
      { title: '', description: '  ', priority: 'nope', dueDate: '', customerName: null }
    );
    assert.deepEqual(partial, {});
  });

  it('returns {} for null draft', () => {
    assert.deepEqual(mapProjectIntakeDraftToForm({}, null), {});
  });
});
