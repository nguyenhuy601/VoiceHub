/**
 * Requirement Analysis workbook — buffer-only (no write*Asset).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const {
  ANALYSIS_TEMPLATE_TYPE,
  ANALYSIS_TEMPLATE_VERSION,
  ANALYSIS_TEMPLATE_FILE_NAME,
  ANALYSIS_SHEETS,
} = require('../src/constants/requirementAnalysisTemplate.constants');
const {
  buildRequirementAnalysisTemplateBuffer,
} = require('../src/utils/requirement/requirementAnalysisTemplateBuilder');
const {
  parseAnalysisWorkbook,
  isAnalysisTemplateType,
} = require('../src/utils/requirement/requirementAnalysisTemplateParse');
const {
  validateAnalysisWorkbook,
} = require('../src/utils/requirement/requirementAnalysisTemplateValidate');

describe('requirementAnalysisWorkbook', () => {
  it('builds Meta/README + 7 BA sheets only', async () => {
    const buf = await buildRequirementAnalysisTemplateBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buf));
    assert.ok(wb.getWorksheet(ANALYSIS_SHEETS.META));
    assert.ok(wb.getWorksheet(ANALYSIS_SHEETS.README));
    assert.ok(wb.getWorksheet(ANALYSIS_SHEETS.TRACEABILITY));
    assert.ok(wb.getWorksheet(ANALYSIS_SHEETS.BG));
    assert.ok(wb.getWorksheet(ANALYSIS_SHEETS.BR));
    assert.ok(wb.getWorksheet(ANALYSIS_SHEETS.BPM));
    assert.ok(wb.getWorksheet(ANALYSIS_SHEETS.FR));
    assert.ok(wb.getWorksheet(ANALYSIS_SHEETS.UC));
    assert.ok(wb.getWorksheet(ANALYSIS_SHEETS.NFR));
    assert.equal(wb.getWorksheet('01_Project_Context'), undefined);
    assert.equal(wb.getWorksheet('11_AI_Analysis_Output'), undefined);
    assert.equal(ANALYSIS_TEMPLATE_FILE_NAME, 'Requirement_Analysis.xlsx');
    const meta = wb.getWorksheet(ANALYSIS_SHEETS.META);
    assert.equal(String(meta.getRow(2).getCell(2).value || ''), ANALYSIS_TEMPLATE_TYPE);
    assert.equal(String(meta.getRow(3).getCell(2).value || ''), ANALYSIS_TEMPLATE_VERSION);
  });

  it('parses Capability hierarchy and Traceability CR links', async () => {
    const buf = await buildRequirementAnalysisTemplateBuffer();
    const parsed = parseAnalysisWorkbook(Buffer.from(buf));
    assert.equal(isAnalysisTemplateType(parsed.templateType), true);
    assert.ok(parsed.functionalRequirements.some((r) => r.level === 'Capability'));
    assert.ok(parsed.functionalRequirements.some((r) => r.externalId === 'FR-001'));
    assert.ok((parsed.traceabilityLinks || []).length >= 1);
    assert.ok(
      parsed.traceabilityLinks.some(
        (t) => t.analysisId === 'FR-001' && t.customerRequirementId === 'CR-001'
      )
    );
  });

  it('validates built template without errors', async () => {
    const buf = await buildRequirementAnalysisTemplateBuffer();
    const parsed = parseAnalysisWorkbook(Buffer.from(buf));
    const validation = validateAnalysisWorkbook({
      fileName: 'Requirement_Analysis.xlsx',
      fileSize: Buffer.from(buf).length,
      parsed,
    });
    if (!validation.valid) {
      assert.fail(
        `Expected valid Analysis workbook, errors: ${JSON.stringify(validation.issues.filter((i) => i.severity === 'error'))}`
      );
    }
    assert.equal(validation.valid, true);
    assert.equal(validation.canRunAiAnalysis, false);
  });
});
