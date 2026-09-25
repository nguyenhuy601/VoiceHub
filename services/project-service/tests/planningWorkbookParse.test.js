const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('planningWorkbookParse + builder', () => {
  function requireXlsx() {
    try {
      return require('xlsx');
    } catch {
      return null;
    }
  }

  it('builds multi-sheet workbook with physical headers and parses RESOURCE_ROLES merge', () => {
    const XLSX = requireXlsx();
    if (!XLSX) return;

    const { buildPlanningWorkbookBuffer, buildSeedMapsFromRa } = require('../src/utils/planning/planningWorkbookBuilder');
    const { parsePlanningWorkbookXlsx } = require('../src/utils/planning/planningWorkbookParse');
    const {
      isMultiSheetPlanningWorkbook,
      PHYSICAL_HEADERS,
      PLANNING_WORKBOOK_SCHEMA_VERSION,
    } = require('../src/constants/planningWorkbookCatalog');

    const seed = buildSeedMapsFromRa({
      frs: [{ externalKey: 'FR-1', title: 'Login', summary: 's' }],
      nfrs: [],
      assumptions: ['Server always up'],
      existingKeys: new Set(),
    });
    assert.ok(seed.byKind.WBS.some((r) => r.externalKey.includes('FR-1')));
    assert.ok(seed.byKind.RISK.some((r) => r.externalKey.startsWith('RISK-ASM')));

    const buf = buildPlanningWorkbookBuffer({
      project: { _id: 'p1', name: 'Demo', key: 'DEMO' },
      seedFromRa: true,
      seed,
    });
    assert.ok(Buffer.isBuffer(buf) && buf.length > 100);

    const wb = XLSX.read(buf, { type: 'buffer' });
    assert.ok(isMultiSheetPlanningWorkbook(wb.SheetNames));
    assert.ok(wb.SheetNames.includes('00_Meta'));
    assert.ok(wb.SheetNames.includes('WBS'));
    assert.ok(wb.SheetNames.includes('RESOURCE_ROLES'));

    const wbsAoa = XLSX.utils.sheet_to_json(wb.Sheets.WBS, { header: 1 });
    assert.deepEqual(wbsAoa[0], PHYSICAL_HEADERS);
    assert.notEqual(wbsAoa[0][0], 'externalKey');

    const rolesAoa = XLSX.utils.sheet_to_json(wb.Sheets.RESOURCE_ROLES, { header: 1 });
    assert.deepEqual(rolesAoa[0], PHYSICAL_HEADERS);

    const parsed = parsePlanningWorkbookXlsx(buf);
    assert.equal(parsed.format, 'xlsx_workbook');
    assert.equal(parsed.meta.schemaVersion, PLANNING_WORKBOOK_SCHEMA_VERSION);
    assert.ok(parsed.rows.length >= 1);
    const res = parsed.rows.find((r) => r.kind === 'RESOURCE');
    assert.ok(res);
    assert.ok(Array.isArray(res.structured?.roles) && res.structured.roles.length >= 1);

    const wbs = parsed.rows.find((r) => r.kind === 'WBS' && String(r.externalKey).includes('FR-1'));
    assert.ok(wbs);
    assert.equal(wbs.structured?.sourceFrKey, 'FR-1');
  });

  it('parses template-like physical AOA (DEPENDENCY + WBS anomaly externalKey header)', () => {
    const XLSX = requireXlsx();
    if (!XLSX) return;

    const { parsePlanningWorkbookXlsx } = require('../src/utils/planning/planningWorkbookParse');
    const { PHYSICAL_HEADERS } = require('../src/constants/planningWorkbookCatalog');

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Key', 'Value'],
        ['schemaVersion', '1.1.0'],
        ['projectKey', 'DEMO'],
      ]),
      '00_Meta'
    );
    // WBS anomaly: first header is externalKey instead of ID
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['externalKey', 'Name', 'Description', 'Ref/Notes', 'Start', 'End', 'Hours', 'Extra1', 'Extra2', 'Extra3', 'Extra4'],
        ['WBS-01', 'Init', 'Setup', '', '2026-09-28', '2026-10-09', 80, '', '', '', 'pm;ba'],
        ['WBS-01-01', 'Child', 'Detail', 'WBS-01', '2026-09-28', '2026-10-02', 32, '', '', 'FR-1', 'ba'],
      ]),
      'WBS'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        PHYSICAL_HEADERS,
        ['DEP-001', 'A→B', 'link', 'WBS-01', 'WBS-02', 'FS', 0, '', '', '', ''],
      ]),
      'DEPENDENCY'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        PHYSICAL_HEADERS,
        ['RES-PM', 'Project Manager', 'Gov', 480, '', '', '', '', '', '', ''],
      ]),
      'RESOURCE'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        PHYSICAL_HEADERS,
        ['RES-PM', 'pm', 'Project Manager', 1, 'planning', 480, 'notes', '', '', '', ''],
      ]),
      'RESOURCE_ROLES'
    );

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = parsePlanningWorkbookXlsx(buf);
    assert.equal(parsed.format, 'xlsx_workbook');
    const reqErrors = parsed.errors.filter((e) => e.code === 'REQUIRED');
    assert.equal(reqErrors.length, 0, JSON.stringify(reqErrors));

    const wbsRoot = parsed.rows.find((r) => r.externalKey === 'WBS-01');
    assert.ok(wbsRoot);
    assert.equal(wbsRoot.title, 'Init');
    assert.equal(wbsRoot.structured?.effortHours, 80);

    const wbsChild = parsed.rows.find((r) => r.externalKey === 'WBS-01-01');
    assert.ok(wbsChild);
    assert.equal(wbsChild.parentExternalKey, 'WBS-01');
    assert.equal(wbsChild.structured?.sourceFrKey, 'FR-1');

    const dep = parsed.rows.find((r) => r.kind === 'DEPENDENCY');
    assert.ok(dep);
    assert.equal(dep.structured?.fromKey, 'WBS-01');
    assert.equal(dep.structured?.toKey, 'WBS-02');
    assert.equal(dep.structured?.dependencyType, 'FS');

    const res = parsed.rows.find((r) => r.kind === 'RESOURCE' && r.externalKey === 'RES-PM');
    assert.ok(res);
    assert.equal(res.structured?.effortHours, 480);
    assert.ok(Array.isArray(res.structured?.roles) && res.structured.roles.length === 1);
    assert.equal(res.structured.roles[0].roleKey, 'pm');
  });

  it('dual-reads camelCase 1.0.0 workbook headers', () => {
    const XLSX = requireXlsx();
    if (!XLSX) return;

    const { parsePlanningWorkbookXlsx } = require('../src/utils/planning/planningWorkbookParse');

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Key', 'Value'],
        ['schemaVersion', '1.0.0'],
      ]),
      '00_Meta'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          externalKey: 'WBS-LEGACY',
          title: 'Legacy row',
          summary: 'from camelCase',
          parentExternalKey: '',
          startDate: '2026-01-01',
          endDate: '2026-01-15',
          effortHours: 10,
          sourceFrKey: 'FR-X',
        },
      ]),
      'WBS'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          externalKey: 'DEP-L',
          title: 'Dep',
          fromKey: 'WBS-A',
          toKey: 'WBS-B',
          dependencyType: 'FS',
        },
      ]),
      'DEPENDENCY'
    );

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = parsePlanningWorkbookXlsx(buf);
    const reqErrors = parsed.errors.filter((e) => e.code === 'REQUIRED');
    assert.equal(reqErrors.length, 0, JSON.stringify(reqErrors));
    const wbs = parsed.rows.find((r) => r.externalKey === 'WBS-LEGACY');
    assert.ok(wbs);
    assert.equal(wbs.title, 'Legacy row');
    assert.equal(wbs.structured?.sourceFrKey, 'FR-X');
    const dep = parsed.rows.find((r) => r.kind === 'DEPENDENCY');
    assert.equal(dep.structured?.fromKey, 'WBS-A');
    assert.equal(dep.structured?.toKey, 'WBS-B');
  });

  it('legacy single-sheet Planning still parses via dumpParse', () => {
    const XLSX = requireXlsx();
    if (!XLSX) return;

    const { parsePlanningDumpXlsx } = require('../src/utils/planning/planningDumpParse');
    const rows = [
      { kind: 'WBS', externalKey: 'W1', title: 'Work', startDate: '2026-01-01', endDate: '2026-01-10' },
    ];
    const sheet = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Planning');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = parsePlanningDumpXlsx(buf);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].kind, 'WBS');
    assert.equal(parsed.format || 'xlsx', 'xlsx');
  });

  it('empty template workbook round-trips', () => {
    const XLSX = requireXlsx();
    if (!XLSX) return;

    const { buildPlanningDumpTemplateBuffer, parsePlanningDumpXlsx } = require('../src/utils/planning/planningDumpParse');
    const buf = buildPlanningDumpTemplateBuffer({ seedFromRa: false });
    const parsed = parsePlanningDumpXlsx(buf);
    assert.equal(parsed.format, 'xlsx_workbook');
    assert.ok(parsed.rows.length >= 8);
  });

  it('parses Downloads template file when present', () => {
    const XLSX = requireXlsx();
    if (!XLSX) return;

    const candidates = [
      path.join(process.env.USERPROFILE || '', 'Downloads', 'Project_Planning_SRS_V1.0_Template_Based.xlsx'),
      'C:/Users/RAZO/Downloads/Project_Planning_SRS_V1.0_Template_Based.xlsx',
    ];
    const filePath = candidates.find((p) => p && fs.existsSync(p));
    if (!filePath) return;

    const { parsePlanningWorkbookXlsx } = require('../src/utils/planning/planningWorkbookParse');
    const buf = fs.readFileSync(filePath);
    const parsed = parsePlanningWorkbookXlsx(buf);
    assert.equal(parsed.format, 'xlsx_workbook');
    const reqErrors = parsed.errors.filter((e) => e.code === 'REQUIRED');
    assert.equal(reqErrors.length, 0, JSON.stringify(reqErrors.slice(0, 5)));
    assert.ok(parsed.rows.some((r) => r.kind === 'WBS'));
    assert.ok(parsed.rows.some((r) => r.kind === 'DEPENDENCY'));
    assert.ok(parsed.rows.some((r) => r.kind === 'RESOURCE'));
    const dep = parsed.rows.find((r) => r.externalKey === 'DEP-001');
    if (dep) {
      assert.equal(dep.structured?.fromKey, 'WBS-01');
      assert.equal(dep.structured?.toKey, 'WBS-02');
    }
  });
});
