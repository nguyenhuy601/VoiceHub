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
