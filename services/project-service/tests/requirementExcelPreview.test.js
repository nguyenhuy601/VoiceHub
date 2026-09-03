const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildExcelPreviewFromBuffer,
  buildRequirementSourceStoragePath,
  matrixToPreviewRows,
  MAX_PREVIEW_ROWS,
  MAX_PREVIEW_COLS,
} = require('../src/utils/requirementExcelPreview');
const { buildRequirementTemplateBuffer } = require('../src/utils/requirementTemplateBuilder');
const { parseRequirementWorkbook } = require('../src/utils/requirementTemplateParse');

describe('requirementExcelPreview', () => {
  it('matrixToPreviewRows caps rows and cols with truncated flag', () => {
    const wide = Array.from({ length: 3 }, () =>
      Array.from({ length: MAX_PREVIEW_COLS + 5 }, (_, i) => `c${i}`)
    );
    const wideResult = matrixToPreviewRows(wide);
    assert.equal(wideResult.colCount, MAX_PREVIEW_COLS);
    assert.equal(wideResult.truncated, true);
    assert.equal(wideResult.rows[0].cells.length, MAX_PREVIEW_COLS);

    const tall = Array.from({ length: MAX_PREVIEW_ROWS + 10 }, (_, r) => [`r${r}`]);
    const tallResult = matrixToPreviewRows(tall);
    assert.equal(tallResult.rows.length, MAX_PREVIEW_ROWS);
    assert.equal(tallResult.truncated, true);
  });

  it('buildExcelPreviewFromBuffer returns all sheets from template', async () => {
    const buf = Buffer.from(await buildRequirementTemplateBuffer());
    const preview = buildExcelPreviewFromBuffer(buf, { fileName: 'Requirement_Template.xlsx' });

    assert.equal(preview.fileName, 'Requirement_Template.xlsx');
    assert.ok(preview.sheetCount >= 4);
    assert.ok(Array.isArray(preview.sheets));
    assert.ok(preview.sheets.length === preview.sheetCount);
    assert.ok(preview.totalRows > 0);

    const fr = preview.sheets.find((s) => /functional/i.test(s.name));
    assert.ok(fr, 'Functional Requirement sheet present');
    assert.ok(fr.rows.length >= 2);
    assert.equal(fr.rows[0].rowNumber, 1);
    assert.ok(fr.rows[0].cells.length >= 1);
  });

  it('buildExcelPreviewFromBuffer overlays rolled-up Effort Hours on non-leaf rows', async () => {
    const buf = Buffer.from(await buildRequirementTemplateBuffer());
    const parsed = parseRequirementWorkbook(buf);
    const preview = buildExcelPreviewFromBuffer(buf, {
      fileName: 'Requirement_Template.xlsx',
      functionalRequirements: parsed.functionalRequirements || [],
    });

    const fr = preview.sheets.find((s) => /functional/i.test(s.name));
    assert.ok(fr, 'Functional Requirement sheet present');

    const header = fr.rows[0].cells;
    const idIdx = header.findIndex((h) => String(h).toLowerCase() === 'id');
    const hoursIdx = header.findIndex((h) => String(h).toLowerCase() === 'effort hours');
    assert.ok(idIdx >= 0);
    assert.ok(hoursIdx >= 0);

    const byId = new Map(
      fr.rows.slice(1).map((row) => [String(row.cells[idIdx] || '').trim(), row.cells[hoursIdx]])
    );
    assert.equal(byId.get('FR-001'), '40');
    assert.equal(byId.get('FR-002'), '40');
    assert.equal(byId.get('FR-003'), '40');
    assert.equal(byId.get('FR-004'), '40');
  });

  it('buildExcelPreviewFromBuffer handles empty buffer', () => {
    const preview = buildExcelPreviewFromBuffer(null, { fileName: 'x.xlsx' });
    assert.equal(preview.sheetCount, 0);
    assert.deepEqual(preview.sheets, []);
  });

  it('buildRequirementSourceStoragePath stays within 128 chars', () => {
    const orgId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const packId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const path = buildRequirementSourceStoragePath(orgId, packId);
    assert.ok(path.length <= 128);
    assert.match(path, /^requirement-imports\//);
    assert.match(path, /\.xlsx$/);
  });
});
