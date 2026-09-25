const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PLANNING_WORKBOOK_SCHEMA_VERSION,
  META_SHEET,
  RESOURCE_ROLES_SHEET,
  PHYSICAL_HEADERS,
  KIND_PHYSICAL_MAP,
  RESOURCE_ROLES_PHYSICAL_MAP,
  SHEET_COLUMNS,
  columnsForSheet,
  requiredKeysForSheet,
  isMultiSheetPlanningWorkbook,
  physicalHeadersForSheet,
  domainItemFromPhysicalRow,
  physicalRowFromDomain,
  defaultSampleRow,
} = require('../src/constants/planningWorkbookCatalog');
const { PLANNING_ARTIFACT_KINDS } = require('../src/constants/planningArtifact');

describe('planningWorkbookCatalog', () => {
  it('has schema version 1.1.0 and meta/roles sheet names', () => {
    assert.equal(PLANNING_WORKBOOK_SCHEMA_VERSION, '1.1.0');
    assert.equal(META_SHEET, '00_Meta');
    assert.equal(RESOURCE_ROLES_SHEET, 'RESOURCE_ROLES');
  });

  it('defines universal physical headers (11 cols)', () => {
    assert.deepEqual(PHYSICAL_HEADERS, [
      'ID',
      'Name',
      'Description',
      'Ref/Notes',
      'Start',
      'End',
      'Hours',
      'Extra1',
      'Extra2',
      'Extra3',
      'Extra4',
    ]);
  });

  it('defines columns for every planning kind', () => {
    for (const kind of PLANNING_ARTIFACT_KINDS) {
      const cols = columnsForSheet(kind);
      assert.ok(Array.isArray(cols) && cols.length >= 2, kind);
      assert.ok(requiredKeysForSheet(kind).includes('externalKey'));
      assert.ok(requiredKeysForSheet(kind).includes('title'));
      assert.ok(SHEET_COLUMNS[kind]);
      assert.ok(KIND_PHYSICAL_MAP[kind]);
      assert.equal(KIND_PHYSICAL_MAP[kind].ID, 'externalKey');
      assert.equal(KIND_PHYSICAL_MAP[kind].Name, 'title');
      assert.deepEqual(physicalHeadersForSheet(kind), PHYSICAL_HEADERS);
    }
  });

  it('RESOURCE_ROLES maps ID → resourceExternalKey', () => {
    assert.equal(RESOURCE_ROLES_PHYSICAL_MAP.ID, 'resourceExternalKey');
    assert.equal(RESOURCE_ROLES_PHYSICAL_MAP.Name, 'roleKey');
    assert.equal(RESOURCE_ROLES_PHYSICAL_MAP.Description, 'title');
    assert.deepEqual(physicalHeadersForSheet(RESOURCE_ROLES_SHEET), PHYSICAL_HEADERS);
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

  it('domainItemFromPhysicalRow maps template WBS / DEPENDENCY headers', () => {
    const wbs = domainItemFromPhysicalRow('WBS', {
      ID: 'WBS-01',
      Name: 'Init',
      Description: 'Setup',
      'Ref/Notes': 'WBS-00',
      Start: '2026-09-28',
      End: '2026-10-09',
      Hours: 80,
      Extra4: 'pm;ba',
    });
    assert.equal(wbs.externalKey, 'WBS-01');
    assert.equal(wbs.title, 'Init');
    assert.equal(wbs.summary, 'Setup');
    assert.equal(wbs.parentExternalKey, 'WBS-00');
    assert.equal(wbs.startDate, '2026-09-28');
    assert.equal(wbs.endDate, '2026-10-09');
    assert.equal(wbs.effortHours, 80);
    assert.equal(wbs.skillKeys, 'pm;ba');

    const dep = domainItemFromPhysicalRow('DEPENDENCY', {
      ID: 'DEP-001',
      Name: 'A depends B',
      'Ref/Notes': 'WBS-01',
      Start: 'WBS-02',
      End: 'FS',
      Hours: 0,
    });
    assert.equal(dep.fromKey, 'WBS-01');
    assert.equal(dep.toKey, 'WBS-02');
    assert.equal(dep.dependencyType, 'FS');
    assert.equal(dep.lagDays, 0);
  });

  it('domainItemFromPhysicalRow accepts externalKey alias for ID (WBS anomaly)', () => {
    const wbs = domainItemFromPhysicalRow('WBS', {
      externalKey: 'WBS-99',
      Name: 'Legacy header',
    });
    assert.equal(wbs.externalKey, 'WBS-99');
    assert.equal(wbs.title, 'Legacy header');
  });

  it('physicalRowFromDomain round-trips WBS domain → ID/Name', () => {
    const phys = physicalRowFromDomain('WBS', {
      externalKey: 'WBS-01',
      title: 'Init',
      summary: 's',
      parentExternalKey: 'WBS-00',
      startDate: '2026-01-01',
      endDate: '2026-01-10',
      effortHours: 8,
      skillKeys: 'ba',
    });
    assert.equal(phys.ID, 'WBS-01');
    assert.equal(phys.Name, 'Init');
    assert.equal(phys.Description, 's');
    assert.equal(phys['Ref/Notes'], 'WBS-00');
    assert.equal(phys.Start, '2026-01-01');
    assert.equal(phys.End, '2026-01-10');
    assert.equal(phys.Hours, 8);
    assert.equal(phys.Extra4, 'ba');
  });
});
