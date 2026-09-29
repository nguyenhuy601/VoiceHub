/**
 * Companion extract — NFR, business request, reference, FR extra columns.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
  extractWorkbookCompanion,
} = require('../src/utils/requirement/workbookCompanionExtract');
const { prefillWorkbook } = require('../src/utils/aiAnalysis/prefillPackFromRawWorkbook');
const { extractWorkbookFr } = require('../src/utils/requirement/workbookFrExtract');

function workbookBuffer(sheets) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function customerRawSheets(extra = {}) {
  const sheets = [
    {
      name: '00_Meta',
      rows: [['Key', 'Value'], ['TemplateType', 'CustomerRaw']],
    },
    {
      name: '01_Project_Context',
      rows: [['Field', 'Value'], ['Project Name', 'Demo']],
    },
    {
      name: '03_Requirement',
      rows: [
        [
          'Requirement ID',
          'Requirement',
          'Module / Area',
          'User / Actor',
          'Priority',
          'Acceptance / Expected Result',
          'Request ID',
          'Source',
          'Customer Notes',
        ],
        [
          'CR-001',
          'Search courses',
          'Registration',
          'Student',
          'High',
          'Listed',
          'BR-001',
          'Customer',
          'Urgent',
        ],
      ],
    },
  ];
  if (extra.nfr) {
    sheets.push({
      name: '04_NFR',
      rows: [
        ['NFR ID', 'Category', 'Customer Requirement', 'Target', 'Priority', 'Source'],
        ...extra.nfr,
      ],
    });
  }
  if (extra.br) {
    sheets.push({
      name: '02_Business_Request',
      rows: [
        ['Request ID', 'Request Title', 'Source', 'Stakeholder'],
        ...extra.br,
      ],
    });
  }
  if (extra.ref) {
    sheets.push({
      name: '05_Reference',
      rows: [
        ['Reference ID', 'Type', 'Name', 'Source'],
        ...extra.ref,
      ],
    });
  }
  return sheets;
}

describe('workbookCompanionExtract', () => {
  it('maps NFR rows onto nonFunctionalRequirements', () => {
    const buf = workbookBuffer(customerRawSheets({
      nfr: [['NFR-001', 'Performance', 'Page loads under 2s', '2s', 'High', 'Customer']],
    }));
    const out = extractWorkbookCompanion(buf);
    assert.equal(out.nonFunctionalRequirements.length, 1);
    assert.equal(out.nonFunctionalRequirements[0].externalId, 'NFR-001');
    assert.equal(out.nonFunctionalRequirements[0].category, 'Performance');
    assert.equal(out.nonFunctionalRequirements[0].requirement, 'Page loads under 2s');
    assert.equal(out.nonFunctionalRequirements[0].source, 'Customer');
  });

  it('does not invent NFR id when the cell is empty', () => {
    const buf = workbookBuffer(customerRawSheets({
      nfr: [['', 'Security', 'Must encrypt', '', 'High', 'Customer']],
    }));
    const out = extractWorkbookCompanion(buf);
    assert.equal(out.nonFunctionalRequirements.length, 0);
    assert.equal(out.meta.missingIdNfr, 1);
  });

  it('returns businessRequests with original header keys in fields', () => {
    const buf = workbookBuffer(customerRawSheets({
      br: [['BR-001', 'Attendance', 'Customer', 'HR']],
    }));
    const out = extractWorkbookCompanion(buf);
    assert.equal(out.customerRawRows.businessRequests.length, 1);
    const row = out.customerRawRows.businessRequests[0];
    assert.equal(row.externalId, 'BR-001');
    assert.equal(row.sheet, '02_Business_Request');
    assert.equal(row.row, 2);
    assert.equal(row.fields['Request ID'], 'BR-001');
    assert.equal(row.fields.Source, 'Customer');
    assert.equal(row.fields.Stakeholder, 'HR');
  });

  it('returns references with original header keys', () => {
    const buf = workbookBuffer(customerRawSheets({
      ref: [['REF-001', 'Doc', 'Spec v1', 'Email']],
    }));
    const out = extractWorkbookCompanion(buf);
    assert.equal(out.customerRawRows.references.length, 1);
    assert.equal(out.customerRawRows.references[0].externalId, 'REF-001');
    assert.equal(out.customerRawRows.references[0].fields.Type, 'Doc');
  });

  it('puts FR extra columns into requirementSources, not description', () => {
    const buf = workbookBuffer(customerRawSheets());
    const out = extractWorkbookCompanion(buf);
    assert.equal(out.customerRawRows.requirementSources.length, 1);
    const src = out.customerRawRows.requirementSources[0];
    assert.equal(src.externalId, 'CR-001');
    assert.equal(src.fields['Request ID'], 'BR-001');
    assert.equal(src.fields.Source, 'Customer');
    assert.equal(src.fields['Customer Notes'], 'Urgent');
    assert.equal(src.fields.Requirement, undefined);
    assert.equal(src.fields['Module / Area'], undefined);
  });
});

describe('prefillWorkbook', () => {
  it('is pure and idempotent for the same buffer', () => {
    const buf = workbookBuffer(customerRawSheets({
      nfr: [['NFR-001', 'Perf', 'Fast', '2s', 'High', 'Customer']],
      br: [['BR-001', 'Title', 'Customer', 'HR']],
    }));
    const first = prefillWorkbook(buf, { filename: 'a.xlsx', documentId: 'doc1' });
    const second = prefillWorkbook(buf, { filename: 'a.xlsx', documentId: 'doc1' });
    assert.deepEqual(first.functionalRequirements, second.functionalRequirements);
    assert.deepEqual(first.nonFunctionalRequirements, second.nonFunctionalRequirements);
    assert.deepEqual(first.customerRawRows, second.customerRawRows);
    assert.equal(first.workbookDiagnostic.status, second.workbookDiagnostic.status);
    assert.equal(first.meta.applied, true);
  });

  it('does not copy name into description when description column is absent', () => {
    const buf = workbookBuffer([
      {
        name: '03_Requirement',
        rows: [
          ['Requirement ID', 'Requirement', 'Module / Area'],
          ['CR-001', 'Search courses', 'Registration'],
        ],
      },
    ]);
    const fr = extractWorkbookFr(buf);
    assert.equal(fr.functionalRequirements[0].name, 'Search courses');
    assert.equal(fr.functionalRequirements[0].description, '');
  });

  it('keeps frSourceMap as location only', () => {
    const buf = workbookBuffer(customerRawSheets());
    const result = prefillWorkbook(buf, { filename: 'raw.xlsx' });
    assert.deepEqual(result.workbookDiagnostic.frSourceMap[0], {
      externalId: 'CR-001',
      sheet: '03_Requirement',
      row: 2,
    });
    assert.equal(result.customerRawRows.requirementSources[0].fields.Source, 'Customer');
  });
});
