/**
 * prefillPackFromRawWorkbook — overview merge from context-like xlsx.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
  prefillPackFromRawWorkbook,
  mergeOverview,
} = require('../src/utils/aiAnalysis/prefillPackFromRawWorkbook');

function buildContextWorkbook() {
  const wb = XLSX.utils.book_new();
  const meta = XLSX.utils.aoa_to_sheet([
    ['Key', 'Value'],
    ['TemplateType', 'CustomerRequirementRaw'],
    ['TemplateVersion', '1.0'],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, '00_Meta');
  const ctx = XLSX.utils.aoa_to_sheet([
    ['Field', 'Value'],
    ['Project Name', 'Demo CRM'],
    ['Project Objective', 'Grow pipeline'],
    ['Business Scope', 'In: sales'],
    ['In Scope', 'Leads'],
    ['Out of Scope', 'Payroll'],
  ]);
  XLSX.utils.book_append_sheet(wb, ctx, '01_Project_Context');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('prefillPackFromRawWorkbook', () => {
  it('mergeOverview fills empty fields only', () => {
    const next = mergeOverview(
      { projectObjective: 'Keep' },
      { projectObjective: 'New', businessScope: 'Scope' }
    );
    assert.equal(next.projectObjective, 'Keep');
    assert.equal(next.businessScope, 'Scope');
  });

  it('maps 03_Requirement columns onto functionalRequirements', () => {
    const wb = XLSX.utils.book_new();
    const meta = XLSX.utils.aoa_to_sheet([
      ['Key', 'Value'],
      ['TemplateType', 'CustomerRaw'],
    ]);
    const ctx = XLSX.utils.aoa_to_sheet([
      ['Field', 'Value'],
      ['Project Name', 'Student System'],
    ]);
    const req = XLSX.utils.aoa_to_sheet([
      [
        'Requirement ID',
        'Requirement',
        'Module / Area',
        'User / Actor',
        'Priority',
        'Acceptance / Expected Result',
      ],
      ['CR-001', 'Student can search courses', 'Registration', 'Student', 'High', 'Results listed'],
      ['', 'Missing id', 'Registration', 'Student', 'Low', ''],
    ]);
    XLSX.utils.book_append_sheet(wb, meta, '00_Meta');
    XLSX.utils.book_append_sheet(wb, ctx, '01_Project_Context');
    XLSX.utils.book_append_sheet(wb, req, '03_Requirement');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const { pack, meta: applied } = prefillPackFromRawWorkbook(
      { overview: {}, functionalRequirements: [] },
      buf,
      { filename: 'raw.xlsx' }
    );
    assert.equal(applied.applied, true);
    assert.equal(applied.source, 'customer_raw');
    assert.equal(pack.functionalRequirements.length, 1);
    assert.equal(pack.functionalRequirements[0].externalId, 'CR-001');
    assert.equal(pack.functionalRequirements[0].name, 'Student can search courses');
    assert.equal(pack.functionalRequirements[0].moduleLabel, 'Registration');
    assert.equal(pack.functionalRequirements[0].actor, 'Student');
    assert.equal(pack.functionalRequirements[0].acceptanceCriteria, 'Results listed');
    assert.equal(pack.functionalRequirements[0].level, 'Requirement');
  });

  it('prefills overview and scope from Customer Raw context workbook', () => {
    const buf = buildContextWorkbook();
    const { pack, meta } = prefillPackFromRawWorkbook(
      { overview: {}, scope: [], functionalRequirements: [] },
      buf,
      { filename: 'raw.xlsx' }
    );
    assert.equal(meta.applied, true);
    assert.ok(
      String(pack.overview.requirementName || pack.overview.projectObjective || '').length > 0 ||
        String(pack.overview.businessScope || '').length > 0
    );
  });
});
