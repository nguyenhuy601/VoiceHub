const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { buildWorkbookBufferFromLists, HEADERS } = require('../src/utils/excelImportTemplate');

describe('excelImportTemplate', () => {
  it('embeds live department names and dropdowns', async () => {
    const buf = await buildWorkbookBufferFromLists({
      deptNames: ['Backend', 'Front End'],
      domains: ['Frontend', 'Backend'],
    });
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 1000);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const names = wb.worksheets.map((s) => s.name);
    assert.ok(names.includes('resource_import'));
    assert.ok(names.includes('lists'));
    assert.ok(names.includes('README'));

    const lists = wb.getWorksheet('lists');
    assert.equal(lists.getCell('A2').value, 'Backend');
    assert.equal(lists.getCell('A3').value, 'Front End');
    assert.equal(lists.getCell('B2').value, 'Frontend');
    assert.equal(lists.getCell('B3').value, 'Backend');
    assert.equal(lists.getCell('C2').value, 'member');
    assert.equal(lists.getCell('E2').value, 'JavaScript');
    assert.ok(String(lists.getCell('E3').value || '').length > 0);
    const jobTitles = [];
    for (let r = 2; r <= 40; r += 1) {
      const v = lists.getCell(r, 4).value;
      if (v) jobTitles.push(String(v));
    }
    assert.ok(jobTitles.includes('Backend Developer'));
    assert.ok(jobTitles.includes('Junior'));
    assert.ok(jobTitles.includes('Tech Lead'));

    const ws = wb.getWorksheet('resource_import');
    HEADERS.forEach((h, i) => {
      assert.equal(String(ws.getCell(1, i + 1).value), h);
    });
    assert.equal(ws.getCell('A1').value, 'fullName');
    assert.ok(!HEADERS.includes('employeeCode'));
    assert.ok(HEADERS.includes('skills'));
    assert.ok(!HEADERS.includes('skill1'));
    assert.ok(!HEADERS.includes('skill5'));
    assert.ok(HEADERS.includes('pastProject5Year'));
    assert.equal(String(ws.getCell('E2').value), 'Chức danh HR');
    assert.equal(ws.getCell('D3').value, 'Backend');
    assert.equal(ws.getCell('F3').value, 'Backend');
    assert.equal(String(ws.getCell('G3').value || ''), 'Node.js, MongoDB');
    assert.match(String(ws.getCell(3, 13).value || ''), /Node\.js/);
    assert.equal(ws.getCell('A3').value, 'Nguyễn An');
    assert.ok(!ws.getCell('G3').dataValidation);
    const deptDv = ws.getCell('D3').dataValidation;
    assert.equal(deptDv?.type, 'list');
    assert.ok(String(deptDv?.formulae?.[0] || '').includes('lists!$A$2'));
    const domainDv = ws.getCell('F3').dataValidation;
    assert.equal(domainDv?.type, 'list');
    const jobDv = ws.getCell('E3').dataValidation;
    assert.equal(jobDv?.type, 'list');
    assert.ok(String(jobDv?.formulae?.[0] || '').includes('lists!$D$2'));
    assert.equal(jobDv?.errorStyle, 'warning');
    const readme = wb.getWorksheet('README');
    const readmeText = [];
    readme.eachRow((row) => {
      readmeText.push(String(row.getCell(1).value || ''), String(row.getCell(2).value || ''));
    });
    assert.ok(readmeText.some((t) => /tối đa 10/i.test(t)));
  });

  it('merges extra job titles into snapshot and parser accepts typed custom title', async () => {
    const { parseExcelToRawRows } = require('../src/utils/excelImportParse');
    const { validateResourceImportRows } = require('../src/utils/resourceImportValidator');
    const buf = await buildWorkbookBufferFromLists({
      deptNames: ['Backend'],
      domains: ['be'],
      jobTitles: ['Nhân viên kho'],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const lists = wb.getWorksheet('lists');
    const dumped = [];
    for (let r = 2; r <= 50; r += 1) {
      const v = lists.getCell(r, 4).value;
      if (v) dumped.push(String(v));
    }
    assert.ok(dumped.includes('Nhân viên kho'));

    const rows = parseExcelToRawRows(buf);
    assert.equal(rows.length, 1);
    rows[0].jobTitle = 'Chuyên viên tự đặt';
    const validated = validateResourceImportRows(rows, { allowedEmailDomains: null });
    assert.equal(validated.ok, true);
    assert.equal(validated.normalizedRows[0].jobTitle, 'Chuyên viên tự đặt');
  });

  it('still builds when org has zero departments', async () => {
    const buf = await buildWorkbookBufferFromLists({ deptNames: [], domains: ['be'] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('resource_import');
    assert.equal(ws.getCell('D3').value || '', '');
    assert.ok(!ws.getCell('D3').dataValidation);
    assert.equal(ws.getCell('F3').dataValidation?.type, 'list');
  });

  it('parser skips empty rows expanded by dropdown used-range', async () => {
    const { parseExcelToRawRows } = require('../src/utils/excelImportParse');
    const buf = await buildWorkbookBufferFromLists({
      deptNames: ['Backend'],
      domains: ['be'],
    });
    const rows = parseExcelToRawRows(buf);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'an.nguyen@company.com');
    assert.equal(rows[0].rowNumber, 3);
  });
});
