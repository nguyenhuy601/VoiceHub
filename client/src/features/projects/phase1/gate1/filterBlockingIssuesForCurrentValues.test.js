import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterBlockingIssuesForCurrentValues,
  sectionHasUnresolvedIntegrityIssues,
} from './resolveConflictAmbiguityUi.js';

describe('filterBlockingIssuesForCurrentValues', () => {
  it('clears Acceptance criteria once editedPayload fills ac', () => {
    const issues = [
      {
        blockKind: 'data_integrity',
        kind: 'incomplete_fields',
        missing: ['Acceptance criteria'],
      },
    ];
    const row = { logicalId: 'CR-001', title: 'X', ac: '' };
    const filtered = filterBlockingIssuesForCurrentValues(issues, row, {
      action: 'edit',
      editedPayload: { ac: 'chức năng chạy được', acceptanceCriteria: 'chức năng chạy được' },
    });
    assert.equal(filtered.length, 0);
  });

  it('clears when row already has acceptanceCriteria', () => {
    const issues = [
      {
        blockKind: 'data_integrity',
        kind: 'incomplete_fields',
        missing: ['Acceptance criteria'],
      },
    ];
    const row = { logicalId: 'CR-002', acceptanceCriteria: 'AC ok' };
    const filtered = filterBlockingIssuesForCurrentValues(issues, row, null);
    assert.equal(filtered.length, 0);
  });

  it('keeps other missing labels and relationship issues', () => {
    const issues = [
      {
        blockKind: 'data_integrity',
        kind: 'incomplete_fields',
        missing: ['Acceptance criteria', 'Priority'],
      },
      {
        blockKind: 'relationship_integrity',
        code: 'REL_TARGET_MISSING',
        message: 'target missing',
      },
    ];
    const row = { logicalId: 'CR-003', ac: 'done' };
    const filtered = filterBlockingIssuesForCurrentValues(issues, row, null);
    assert.equal(filtered.length, 2);
    assert.deepEqual(filtered[0].missing, ['Priority']);
    assert.equal(filtered[1].code, 'REL_TARGET_MISSING');
  });

  it('section tab clears warning when all AC gaps are filled', () => {
    const rows = [
      {
        logicalId: 'CR-001',
        blockingIssues: [
          {
            blockKind: 'data_integrity',
            kind: 'incomplete_fields',
            missing: ['Acceptance criteria'],
          },
        ],
      },
    ];
    assert.equal(sectionHasUnresolvedIntegrityIssues(rows, {}), true);
    assert.equal(
      sectionHasUnresolvedIntegrityIssues(rows, {
        'CR-001': { action: 'edit', editedPayload: { ac: 'ok' } },
      }),
      false
    );
  });
});
