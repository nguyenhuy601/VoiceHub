const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('planningWorkbookParse + builder', () => {
  it('builds multi-sheet workbook and parses RESOURCE_ROLES merge', () => {
    let xlsxOk = true;
    try {
      require('xlsx');
    } catch {
      xlsxOk = false;
    }
    if (!xlsxOk) return;

    const { buildPlanningWorkbookBuffer, buildSeedMapsFromRa } = require('../src/utils/planning/planningWorkbookBuilder');
    const { parsePlanningWorkbookXlsx } = require('../src/utils/planning/planningWorkbookParse');
    const { isMultiSheetPlanningWorkbook } = require('../src/constants/planningWorkbookCatalog');
    const XLSX = require('xlsx');

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

    const parsed = parsePlanningWorkbookXlsx(buf);
    assert.equal(parsed.format, 'xlsx_workbook');
    assert.ok(parsed.rows.length >= 1);
    const res = parsed.rows.find((r) => r.kind === 'RESOURCE');
    assert.ok(res);
    assert.ok(Array.isArray(res.structured?.roles) && res.structured.roles.length >= 1);

    const wbs = parsed.rows.find((r) => r.kind === 'WBS' && String(r.externalKey).includes('FR-1'));
    assert.ok(wbs);
    assert.equal(wbs.structured?.sourceFrKey, 'FR-1');
  });

  it('legacy single-sheet Planning still parses via dumpParse', () => {
    let xlsxOk = true;
    try {
      require('xlsx');
    } catch {
      xlsxOk = false;
    }
    if (!xlsxOk) return;

    const XLSX = require('xlsx');
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
    let xlsxOk = true;
    try {
      require('xlsx');
    } catch {
      xlsxOk = false;
    }
    if (!xlsxOk) return;

    const { buildPlanningDumpTemplateBuffer, parsePlanningDumpXlsx } = require('../src/utils/planning/planningDumpParse');
    const buf = buildPlanningDumpTemplateBuffer({ seedFromRa: false });
    const parsed = parsePlanningDumpXlsx(buf);
    assert.equal(parsed.format, 'xlsx_workbook');
    assert.ok(parsed.rows.length >= 8);
  });
});
