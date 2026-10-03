const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PLANNING_WORKBOOK_SCHEMA_VERSION,
  META_SHEET,
  RESOURCE_ROLES_SHEET,
  SHEET_COLUMNS,
  columnsForSheet,
  requiredKeysForSheet,
  isMultiSheetPlanningWorkbook,
  defaultSampleRow,
} = require('../src/constants/planningWorkbookCatalog');
const { PLANNING_ARTIFACT_KINDS } = require('../src/constants/planningArtifact');

describe('planningWorkbookCatalog', () => {
  it('has schema version and meta/roles sheet names', () => {
    assert.equal(typeof PLANNING_WORKBOOK_SCHEMA_VERSION, 'string');
    assert.ok(PLANNING_WORKBOOK_SCHEMA_VERSION.length > 0);
    assert.equal(META_SHEET, '00_Meta');
    assert.equal(RESOURCE_ROLES_SHEET, 'RESOURCE_ROLES');
  });

  it('defines columns for every planning kind', () => {
    for (const kind of PLANNING_ARTIFACT_KINDS) {
      const cols = columnsForSheet(kind);
      assert.ok(Array.isArray(cols) && cols.length >= 2, kind);
      assert.ok(requiredKeysForSheet(kind).includes('externalKey'));
      assert.ok(requiredKeysForSheet(kind).includes('title'));
      assert.ok(SHEET_COLUMNS[kind]);
    }
  });

  it('DEPENDENCY requires fromKey/toKey; SCHEDULE requires dates', () => {
    assert.ok(requiredKeysForSheet('DEPENDENCY').includes('fromKey'));
    assert.ok(requiredKeysForSheet('DEPENDENCY').includes('toKey'));
    assert.ok(requiredKeysForSheet('SCHEDULE').includes('startDate'));
    assert.ok(requiredKeysForSheet('MILESTONE').includes('targetDate'));
  });

  it('detects multi-sheet workbook names', () => {
    assert.equal(isMultiSheetPlanningWorkbook(['Planning']), false);
    assert.equal(isMultiSheetPlanningWorkbook(['00_Meta', 'WBS']), true);
    assert.equal(isMultiSheetPlanningWorkbook(['WBS', 'RISK']), true);
    assert.equal(isMultiSheetPlanningWorkbook(['RESOURCE_ROLES']), true);
  });

  it('defaultSampleRow returns externalKey/title per kind', () => {
    for (const kind of PLANNING_ARTIFACT_KINDS) {
      const row = defaultSampleRow(kind);
      assert.ok(row.externalKey);
      assert.ok(row.title);
    }
  });
});
