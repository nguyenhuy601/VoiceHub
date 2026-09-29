/**
 * Deterministic workbook FR extraction. Buffers stay in memory.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
  extractWorkbookFr,
  extractFromWorkbook,
  TABLE_SCORE_MARGIN,
} = require('../src/utils/requirement/workbookFrExtract');
const {
  isRequirementReady,
  hashFunctionalRequirements,
} = require('../src/utils/requirement/workbookDiagnostic');
const { prefillPackFromRawWorkbook } = require('../src/utils/aiAnalysis/prefillPackFromRawWorkbook');

function workbookBuffer(sheets) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    if (sheet.merges) ws['!merges'] = sheet.merges;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function extractSheets(sheets, fileName) {
  return extractWorkbookFr(workbookBuffer(sheets), { fileName });
}

const FR_HEADER = ['Requirement ID', 'Requirement', 'Module / Area'];

function frRows(count, prefix) {
  const rows = [FR_HEADER];
  for (let i = 1; i <= count; i += 1) {
    rows.push([`${prefix}-${String(i).padStart(3, '0')}`, `Need ${prefix} ${i}`, 'Area']);
  }
  return rows;
}

describe('workbookFrExtract', () => {
  it('maps 03_Requirement and records the source row', () => {
    const result = extractSheets([
      { name: '03_Requirement', rows: [FR_HEADER, ['CR-001', 'Student can search courses', 'Registration']] },
    ]);
    assert.equal(result.diagnostic.status, 'SUCCESS');
    assert.equal(result.functionalRequirements[0].externalId, 'CR-001');
    assert.equal(result.functionalRequirements[0].name, 'Student can search courses');
    assert.equal(result.functionalRequirements[0].moduleLabel, 'Registration');
    assert.equal(result.functionalRequirements[0].level, 'Requirement');
    assert.deepEqual(result.diagnostic.frSourceMap[0], {
      externalId: 'CR-001',
      sheet: '03_Requirement',
      row: 2,
    });
  });

  it('accepts Functional Requirements and FR sheet names', () => {
    for (const name of ['Functional Requirements', 'FR']) {
      const result = extractSheets([{ name, rows: [FR_HEADER, ['FR-001', 'Login', 'Auth']] }]);
      assert.equal(result.diagnostic.sheetSelection.selected, name);
      assert.equal(result.functionalRequirements.length, 1);
    }
  });

  it('selects a header that is not on row 1', () => {
    const result = extractSheets([{
      name: 'Requirements',
      rows: [
        ['Student System'],
        [],
        FR_HEADER,
        ['CR-001', 'Search', 'Courses'],
      ],
    }]);
    assert.equal(result.diagnostic.header.selectedRow, 3);
    assert.ok(result.diagnostic.header.candidateRows.includes(3));
    assert.equal(result.functionalRequirements[0].externalId, 'CR-001');
  });

  it('maps Customer Raw columns including module and actor', () => {
    const result = extractSheets([{
      name: '03_Requirement',
      rows: [[
        'Requirement ID',
        'Requirement',
        'Module / Area',
        'User / Actor',
        'Priority',
        'Acceptance / Expected Result',
      ], ['CR-001', 'Search courses', 'Registration', 'Student', 'High', 'Results listed']],
    }]);
    const row = result.functionalRequirements[0];
    assert.equal(row.actor, 'Student');
    assert.equal(row.acceptanceCriteria, 'Results listed');
    assert.equal(row.moduleLabel, 'Registration');
    assert.equal(result.diagnostic.mappingDiagnostic.status, 'COMPLETE');
  });

  it('reports SHEET_NOT_FOUND when no requirement sheet exists', () => {
    const result = extractSheets([{ name: '01_Project_Context', rows: [['Field', 'Value'], ['Project Name', 'Demo']] }]);
    assert.equal(result.diagnostic.status, 'NOT_READY');
    assert.deepEqual(result.diagnostic.reasonCodes, ['SHEET_NOT_FOUND']);
    assert.equal(result.functionalRequirements.length, 0);
  });

  it('reports MAPPING_EMPTY when the header has no requirement columns', () => {
    const result = extractSheets([{
      name: 'Requirements',
      rows: [['Project', 'Owner', 'Date', 'Status', 'Comment'], ['A', 'B', 'C', 'D', 'E']],
    }]);
    assert.equal(result.diagnostic.status, 'NOT_READY');
    assert.equal(result.diagnostic.mappingDiagnostic.failureReason, 'MAPPING_EMPTY');
    assert.equal(result.diagnostic.mappingDiagnostic.status, 'EMPTY');
    assert.equal(result.diagnostic.reasonCodes.includes('INVALID_ROWS'), false);
    assert.equal(isRequirementReady(result.diagnostic), false);
  });

  it('reports MAPPING_INCOMPLETE for id only and for requirement only', () => {
    const idOnly = extractSheets([{ name: 'FR', rows: [['Requirement ID'], ['CR-001']] }]);
    assert.equal(idOnly.diagnostic.mappingDiagnostic.failureReason, 'MAPPING_INCOMPLETE');
    assert.deepEqual(idOnly.diagnostic.mappingDiagnostic.missing, ['requirement']);
    assert.equal(idOnly.diagnostic.status, 'NOT_READY');

    const reqOnly = extractSheets([{ name: 'FR', rows: [['Requirement'], ['Search']] }]);
    assert.equal(reqOnly.diagnostic.mappingDiagnostic.failureReason, 'MAPPING_INCOMPLETE');
    assert.deepEqual(reqOnly.diagnostic.mappingDiagnostic.missing, ['id']);
  });

  it('completes mapping for id plus requirement and for id plus description', () => {
    const byRequirement = extractSheets([{ name: 'FR', rows: [['ID', 'Requirement'], ['CR-001', 'Search']] }]);
    assert.equal(byRequirement.diagnostic.mappingDiagnostic.status, 'COMPLETE');
    assert.equal(byRequirement.functionalRequirements[0].name, 'Search');

    const byDescription = extractSheets([{ name: 'FR', rows: [['ID', 'Description'], ['CR-001', 'Search text']] }]);
    assert.equal(byDescription.diagnostic.mappingDiagnostic.status, 'COMPLETE');
    assert.equal(byDescription.functionalRequirements[0].name, 'Search text');
    assert.equal(byDescription.diagnostic.mappingDiagnostic.missing.length, 0);
  });

  it('reports REQUIREMENT_ROWS_EMPTY when mapping is complete and no data rows exist', () => {
    const result = extractSheets([{ name: 'FR', rows: [FR_HEADER] }]);
    assert.equal(result.diagnostic.status, 'NOT_READY');
    assert.ok(result.diagnostic.reasonCodes.includes('REQUIREMENT_ROWS_EMPTY'));
    assert.equal(result.functionalRequirements.length, 0);
  });

  it('does not invent an id for a candidate row', () => {
    const result = extractSheets([{
      name: 'FR',
      rows: [FR_HEADER, ['', 'Missing id row', 'Area'], ['CR-001', 'Kept', 'Area']],
    }]);
    assert.equal(result.diagnostic.rows.missingId, 1);
    assert.ok(result.diagnostic.reasonCodes.includes('MISSING_REQUIRED_ID'));
    assert.equal(result.functionalRequirements.length, 1);
    assert.equal(result.diagnostic.status, 'PARTIAL');
    assert.ok(!result.functionalRequirements.some((row) => !row.externalId));
  });

  it('keeps the first duplicate and points frSourceMap at that row only', () => {
    const result = extractSheets([{
      name: 'FR',
      rows: [
        FR_HEADER,
        ['CR-001', 'First text', 'Area'],
        ['cr-001', 'Second text', 'Other'],
      ],
    }]);
    assert.equal(result.diagnostic.rows.duplicateFr, 1);
    assert.equal(result.diagnostic.rows.validFr, 1);
    assert.equal(result.diagnostic.status, 'PARTIAL');
    assert.equal(result.functionalRequirements[0].name, 'First text');
    assert.equal(result.diagnostic.frSourceMap.length, 1);
    assert.equal(result.diagnostic.frSourceMap[0].row, 2);
    assert.deepEqual(result.diagnostic.samples.duplicateIds[0].rows, [2, 3]);
  });

  it('does not choose between two sheets with close scores', () => {
    const result = extractSheets([
      { name: 'Functional Requirements', rows: frRows(2, 'A') },
      { name: 'FR', rows: frRows(2, 'B') },
    ]);
    assert.equal(result.diagnostic.status, 'NOT_READY');
    assert.equal(result.diagnostic.sheetSelection.ambiguous, true);
    assert.equal(result.diagnostic.sheetSelection.selected, undefined);
    assert.deepEqual(result.diagnostic.reasonCodes, ['AMBIGUOUS_SOURCE']);
    assert.equal(result.diagnostic.reasonCodes.includes('MAPPING_AMBIGUOUS'), false);
    assert.equal(result.functionalRequirements.length, 0);
  });

  it('treats a dual-field header as MAPPING_AMBIGUOUS rather than AMBIGUOUS_SOURCE', () => {
    const result = extractSheets([{
      name: 'FR',
      rows: [['Description / Requirement', 'Requirement ID'], ['Text', 'CR-001']],
    }]);
    assert.equal(result.diagnostic.mappingDiagnostic.failureReason, 'MAPPING_AMBIGUOUS');
    assert.equal(result.diagnostic.status, 'NOT_READY');
    assert.equal(result.diagnostic.reasonCodes.includes('AMBIGUOUS_SOURCE'), false);
  });

  it('reports MAPPING_INVALID when one column is the unique best for two fields', () => {
    const result = extractSheets([{
      name: 'FR',
      rows: [['ID Requirement'], ['CR-001']],
    }]);
    assert.equal(result.diagnostic.mappingDiagnostic.failureReason, 'MAPPING_INVALID');
    assert.equal(result.diagnostic.mappingDiagnostic.status, 'INVALID');
    assert.equal(result.diagnostic.status, 'NOT_READY');
    assert.notEqual(result.diagnostic.status, 'FAILED');
  });

  it('reports PARSER_ERROR for a buffer that is not a workbook', () => {
    const result = extractWorkbookFr(Buffer.from('this is not a workbook'), { fileName: 'bad.xlsx' });
    assert.equal(result.diagnostic.status, 'FAILED');
    assert.ok(result.diagnostic.reasonCodes.includes('PARSER_ERROR'));
    assert.ok(result.diagnostic.error.code);
    assert.ok(result.diagnostic.error.message);
  });

  it('does not emit INVALID_ROWS before mapping is complete', () => {
    const result = extractSheets([{ name: 'FR', rows: [['Requirement ID'], ['', '']] }]);
    assert.notEqual(result.diagnostic.mappingDiagnostic.status, 'COMPLETE');
    assert.equal(result.diagnostic.reasonCodes.includes('INVALID_ROWS'), false);
  });

  it('marks PARTIAL when some rows are invalid and at least one FR remains', () => {
    const result = extractSheets([{
      name: 'FR',
      rows: [FR_HEADER, ['CR-001', 'Kept', 'Area'], ['CR-002', '', 'Area']],
    }]);
    assert.equal(result.diagnostic.rows.invalidRows, 1);
    assert.ok(result.diagnostic.reasonCodes.includes('INVALID_ROWS'));
    assert.equal(result.diagnostic.status, 'PARTIAL');
    assert.equal(result.diagnostic.rows.validFr, 1);
  });

  it('stays NOT_READY when every candidate row is invalid', () => {
    const result = extractSheets([{
      name: 'FR',
      rows: [FR_HEADER, ['CR-001', '', 'Area'], ['CR-002', '', 'Area']],
    }]);
    assert.equal(result.diagnostic.rows.validFr, 0);
    assert.ok(result.diagnostic.reasonCodes.includes('INVALID_ROWS'));
    assert.equal(result.diagnostic.status, 'NOT_READY');
  });

  it('does not pick a table when two tables are within the score margin', () => {
    const result = extractSheets([{
      name: 'FR',
      rows: [
        ...frRows(1, 'A'),
        [],
        [],
        ...frRows(1, 'B'),
      ],
    }]);
    assert.ok(TABLE_SCORE_MARGIN >= 1);
    assert.equal(result.diagnostic.status, 'NOT_READY');
    assert.equal(result.diagnostic.tableSelection.selectedHeaderRow, undefined);
    assert.ok(result.diagnostic.reasonCodes.includes('MULTIPLE_REQUIREMENT_TABLES'));
    assert.equal(result.diagnostic.reasonCodes.includes('AMBIGUOUS_SOURCE'), false);
  });

  it('picks the higher table when the score margin is met', () => {
    const rows = [
      ...frRows(1, 'A'),
      [],
      [],
      ...frRows(1 + TABLE_SCORE_MARGIN, 'B'),
    ];
    const result = extractSheets([{ name: 'FR', rows }]);
    assert.ok(result.diagnostic.tableSelection.selectedHeaderRow > 1);
    assert.ok(result.functionalRequirements.every((row) => row.externalId.startsWith('B-')));
    assert.ok(result.diagnostic.reasonCodes.includes('MULTIPLE_REQUIREMENT_TABLES'));
    assert.equal(result.diagnostic.status, 'PARTIAL');
    assert.ok(result.diagnostic.rows.validFr > 0);
  });

  it('isRequirementReady is false when only mappingDiagnostic.failureReason is set', () => {
    const result = extractSheets([{
      name: 'Requirements',
      rows: [['Project', 'Owner', 'Date', 'Status', 'Comment']],
    }]);
    assert.deepEqual(result.diagnostic.reasonCodes, []);
    assert.equal(result.diagnostic.mappingDiagnostic.failureReason, 'MAPPING_EMPTY');
    assert.equal(isRequirementReady(result.diagnostic), false);
  });

  it('keeps the row-count identity across the four candidate outcomes', () => {
    const result = extractSheets([{
      name: 'FR',
      rows: [
        FR_HEADER,
        ['   ', '   ', '   '],
        ['CR-001', 'Kept', ''],
        ['---', '---', '---'],
        ['CR-001', 'Duplicate', ''],
        ['Module: Attendance', '', ''],
        ['CR-002', '', ''],
        ['', 'No id', 'Area'],
      ],
    }]);
    const rows = result.diagnostic.rows;
    assert.equal(
      rows.frCandidates,
      rows.validFr + rows.invalidRows + rows.missingId + rows.duplicateFr
    );
    assert.equal(result.diagnostic.frSourceMap.length, rows.validFr);
    assert.equal(result.diagnostic.warnings.blankRowsSkipped >= 2, true);
    assert.equal(result.functionalRequirements.some((row) => /module:/i.test(row.name)), false);
  });

  it('does not select history, mapping, or risk sheets over a requirement sheet', () => {
    const result = extractSheets([
      { name: 'Requirement History', rows: frRows(4, 'H') },
      { name: 'Mapping', rows: frRows(4, 'M') },
      { name: 'Risk Register', rows: frRows(4, 'R') },
      { name: '03_Requirement', rows: frRows(1, 'CR') },
    ]);
    assert.equal(result.diagnostic.sheetSelection.selected, '03_Requirement');
    assert.equal(result.functionalRequirements[0].externalId, 'CR-001');
  });

  it('forward-fills a merged module cell and does not copy the id', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      FR_HEADER,
      ['CR-001', 'First', 'Attendance'],
      ['CR-002', 'Second', ''],
    ]);
    ws['!merges'] = [{ s: { r: 1, c: 2 }, e: { r: 2, c: 2 } }];
    XLSX.utils.book_append_sheet(wb, ws, 'FR');
    const result = extractFromWorkbook(wb);
    assert.equal(result.functionalRequirements[1].moduleLabel, 'Attendance');
    assert.equal(result.functionalRequirements[1].externalId, 'CR-002');
    assert.ok(result.diagnostic.warnings.mergedCellsDetected >= 1);
  });

  it('counts a formula cell with no cached value and does not use the formula as text', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Requirement ID', 'Requirement'],
      ['CR-001', 'placeholder'],
    ]);
    ws.B2 = { t: 's', f: 'CONCATENATE("secret")' };
    XLSX.utils.book_append_sheet(wb, ws, 'FR');
    const result = extractFromWorkbook(wb);
    assert.ok(result.diagnostic.warnings.formulaCellsDetected >= 1);
    assert.ok(!result.functionalRequirements.some((row) => String(row.name).includes('CONCATENATE')));
  });

  it('returns the same FR list and counts for the same buffer', () => {
    const buffer = workbookBuffer([{ name: '03_Requirement', rows: frRows(3, 'CR') }]);
    const first = extractWorkbookFr(buffer);
    const second = extractWorkbookFr(buffer);
    assert.deepEqual(first.functionalRequirements, second.functionalRequirements);
    assert.deepEqual(first.diagnostic.rows, second.diagnostic.rows);
    assert.deepEqual(first.diagnostic.reasonCodes, second.diagnostic.reasonCodes);
  });

  it('does not create FR from intake corpus text when the workbook has no requirement rows', () => {
    const buffer = workbookBuffer([
      { name: '00_Meta', rows: [['Key', 'Value'], ['TemplateType', 'CustomerRaw']] },
      { name: '01_Project_Context', rows: [['Field', 'Value'], ['Project Objective', 'Grow']] },
    ]);
    const pack = {
      functionalRequirements: [],
      aiAnalysis: { intakeCorpus: { text: 'Requirement CR-999 must be created from full text' } },
    };
    const first = prefillPackFromRawWorkbook(pack, buffer, { filename: 'raw.xlsx' });
    const second = prefillPackFromRawWorkbook(first.pack, buffer, { filename: 'raw.xlsx' });
    assert.equal(first.pack.functionalRequirements.length, 0);
    assert.equal(second.pack.functionalRequirements.length, 0);
    assert.equal(first.pack.aiAnalysis.workbookDiagnostic.status, 'NOT_READY');
    assert.deepEqual(first.pack.aiAnalysis.workbookDiagnostic.rows, second.pack.aiAnalysis.workbookDiagnostic.rows);
    assert.equal(
      hashFunctionalRequirements(first.pack.functionalRequirements),
      hashFunctionalRequirements(second.pack.functionalRequirements)
    );
  });

  it('ignores level and overview when hashing functional requirements', () => {
    const base = [{ externalId: 'CR-001', name: 'Search', description: 'Search', moduleLabel: 'A', actor: '', acceptanceCriteria: '', level: 'Requirement' }];
    const otherLevel = [{ ...base[0], level: 'Feature' }];
    assert.equal(hashFunctionalRequirements(base), hashFunctionalRequirements(otherLevel));
    const renamed = [{ ...base[0], name: 'Other' }];
    assert.notEqual(hashFunctionalRequirements(base), hashFunctionalRequirements(renamed));
  });
});
