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
    assert.ok(wb.SheetNames.includes('01_FieldGuide'));
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
    assert.equal(wbs.structured?.startDate, undefined);
    assert.equal(wbs.structured?.endDate, undefined);
    assert.equal(wbs.structured?.assigneeEmail, undefined);
    assert.equal(wbs.structured?.roleKey, undefined);
    assert.ok(!parsed.rows.some((r) => r.kind === '01_FieldGuide' || r._sheet === '01_FieldGuide'));
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
    const sample = parsed.rows.find((r) => r.kind === 'WBS' && r.externalKey === 'WBS-01');
    assert.ok(sample);
    assert.equal(sample.structured?.startDate, '2026-10-01');
    assert.equal(sample.structured?.endDate, '2026-10-15');
  });

  it('parses a workbook that has no field-guide sheet and no Role Key column', () => {
    let xlsxOk = true;
    try {
      require('xlsx');
    } catch {
      xlsxOk = false;
    }
    if (!xlsxOk) return;

    const XLSX = require('xlsx');
    const { parsePlanningWorkbookXlsx } = require('../src/utils/planning/planningWorkbookParse');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ Key: 'schemaVersion', Value: '1.1.0' }]),
      '00_Meta'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Key', 'Title', 'Start Date', 'Due Date'],
        ['WBS-OLD', 'Legacy', '2026-10-01', '2026-10-15'],
      ]),
      'WBS'
    );
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = parsePlanningWorkbookXlsx(buf);
    assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
    const wbs = parsed.rows.find((r) => r.externalKey === 'WBS-OLD');
    assert.ok(wbs);
    assert.equal(wbs.structured?.startDate, '2026-10-01');
    assert.equal(wbs.structured?.roleKey, undefined);
  });
});
