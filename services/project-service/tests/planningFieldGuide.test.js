const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FIELD_GUIDE_SHEET,
  FIELD_GUIDE_HEADERS,
  FIELD_GUIDE_ROWS,
  labelSuggestedHeader,
} = require('../src/utils/planning/planningFieldGuide');

describe('planningFieldGuide', () => {
  it('names the guide sheet and columns', () => {
    assert.equal(FIELD_GUIDE_SHEET, '01_FieldGuide');
    assert.deepEqual(FIELD_GUIDE_HEADERS, [
      'Sheet',
      'Column',
      'PM action',
      'System suggests',
      'Basis',
    ]);
  });

  it('lists fill and leave-blank columns with a bilingual basis', () => {
    const leaveBlank = FIELD_GUIDE_ROWS.filter((row) => row['PM action'] === 'Leave blank');
    const fill = FIELD_GUIDE_ROWS.filter((row) => row['PM action'] === 'Fill');
    assert.ok(leaveBlank.some((row) => row.Column === 'Due Date (Gợi ý)' && row['System suggests'] === 'Yes'));
    assert.ok(leaveBlank.some((row) => row.Column === 'Assignee Email (Gợi ý)' && row['System suggests'] === 'Yes'));
    assert.ok(leaveBlank.some((row) => row.Column === 'Assignee Name (Gợi ý)' && row['System suggests'] === 'Yes'));
    for (const column of ['Role Key', 'Estimate Hours', 'Start Date', 'Key', 'Title', 'Description', 'Parent Key', 'Source FR Key']) {
      assert.ok(
        fill.some((row) => row.Sheet === 'WBS' && row.Column === column && row['System suggests'] === 'No'),
        column
      );
    }
    for (const sheet of ['SCHEDULE', 'MILESTONE', 'RELEASE', 'RISK', 'ARCHITECTURE', 'DEPENDENCY']) {
      assert.ok(fill.some((row) => row.Sheet === sheet && row['System suggests'] === 'No'), sheet);
    }
    for (const row of FIELD_GUIDE_ROWS) {
      assert.match(row.Basis, /VI: /);
      assert.match(row.Basis, /EN: /);
    }
  });

  it('labels only the WBS columns the import may suggest', () => {
    assert.equal(labelSuggestedHeader('WBS', 'Due Date'), 'Due Date (Gợi ý)');
    assert.equal(labelSuggestedHeader('WBS', 'Assignee Email'), 'Assignee Email (Gợi ý)');
    assert.equal(labelSuggestedHeader('WBS', 'Assignee Name'), 'Assignee Name (Gợi ý)');
    assert.equal(labelSuggestedHeader('WBS', 'Start Date'), 'Start Date');
    assert.equal(labelSuggestedHeader('WBS', 'Estimate Hours'), 'Estimate Hours');
    assert.equal(labelSuggestedHeader('SCHEDULE', 'Due Date'), 'Due Date');
    assert.equal(labelSuggestedHeader('RELEASE', 'Due Date'), 'Due Date');
  });
});
