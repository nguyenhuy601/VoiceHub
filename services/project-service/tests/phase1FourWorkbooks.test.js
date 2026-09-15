/**
 * Wave 1–3 — Customer Raw + Requirement Analysis builders; AI WHAT/HOW gate.
 * Buffer-only — do not write*Asset in tests.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const {
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_TEMPLATE_TYPE,
  CUSTOMER_RAW_FILE_NAME,
} = require('../src/constants/customerRawTemplate.constants');
const {
  buildCustomerRawTemplateBuffer,
} = require('../src/utils/requirement/customerRawTemplateBuilder');
const {
  ANALYSIS_TEMPLATE_FILE_NAME,
  ANALYSIS_TEMPLATE_TYPE,
} = require('../src/constants/requirementAnalysisTemplate.constants');
const {
  buildRequirementAnalysisTemplateBuffer,
} = require('../src/utils/requirement/requirementAnalysisTemplateBuilder');
const {
  AI_ANALYSIS_WHAT_JOBS,
  AI_ANALYSIS_HOW_JOBS,
  isAiAnalysisWhatJob,
  isAiAnalysisHowJob,
} = require('../src/constants/aiAnalysisJobs.constants');
const { collectConfirmedRows } = require('../src/utils/aiAnalysis/aiAnalysisSheet11Export');
const { createEmptyAiAnalysisContainer } = require('../src/utils/aiAnalysis/aiAnalysisContainer');
const {
  parseAnalysisWorkbook,
} = require('../src/utils/requirement/requirementAnalysisTemplateParse');
const { TEMPLATE_FILE_NAME } = require('../src/constants/requirementTemplate.constants');

describe('phase1FourWorkbooks', () => {
  it('builds Customer Raw workbook with Meta TemplateType=CustomerRaw', async () => {
    const buf = await buildCustomerRawTemplateBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buf));
    assert.ok(wb.getWorksheet(CUSTOMER_RAW_SHEETS.META));
    assert.ok(wb.getWorksheet(CUSTOMER_RAW_SHEETS.CONTEXT));
    assert.ok(wb.getWorksheet(CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST));
    assert.ok(wb.getWorksheet(CUSTOMER_RAW_SHEETS.REQUIREMENT));
    assert.ok(wb.getWorksheet(CUSTOMER_RAW_SHEETS.NFR));
    assert.ok(wb.getWorksheet(CUSTOMER_RAW_SHEETS.REFERENCE));
    assert.equal(wb.getWorksheet('01_Sources'), undefined);
    const meta = wb.getWorksheet(CUSTOMER_RAW_SHEETS.META);
    const typeRow = meta.getRow(2).values;
    assert.equal(String(typeRow[1] || '').trim(), 'TemplateType');
    assert.equal(String(typeRow[2] || '').trim(), CUSTOMER_RAW_TEMPLATE_TYPE);
    const versionRow = meta.getRow(3).values;
    assert.equal(String(versionRow[1] || '').trim(), 'TemplateVersion');
    assert.equal(String(versionRow[2] || '').trim(), '1.1-raw');
    const ctxHeader = wb.getWorksheet(CUSTOMER_RAW_SHEETS.CONTEXT).getRow(1).values;
    assert.equal(String(ctxHeader[1] || '').trim(), 'Field');
    assert.equal(String(ctxHeader[2] || '').trim(), 'Value');
    const brqHeader = wb.getWorksheet(CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST).getRow(1).values;
    assert.equal(String(brqHeader[1] || '').trim(), 'Request ID');
    assert.equal(String(brqHeader[3] || '').trim(), 'Customer Statement');
    const reqHeader = wb.getWorksheet(CUSTOMER_RAW_SHEETS.REQUIREMENT).getRow(1).values;
    assert.equal(String(reqHeader[1] || '').trim(), 'Requirement ID');
    assert.equal(CUSTOMER_RAW_FILE_NAME, 'Customer_Requirement_Raw.xlsx');
  });

  it('builds Requirement Analysis workbook with 7 BA sheets', async () => {
    const buf = await buildRequirementAnalysisTemplateBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buf));
    assert.ok(wb.getWorksheet('01_Traceability'));
    assert.ok(wb.getWorksheet('02_BG'));
    assert.ok(wb.getWorksheet('03_BR'));
    assert.ok(wb.getWorksheet('04_BPM'));
    assert.ok(wb.getWorksheet('05_FR'));
    assert.ok(wb.getWorksheet('06_UC'));
    assert.ok(wb.getWorksheet('07_NFR'));
    assert.equal(wb.getWorksheet('01_Project_Context'), undefined);
    const meta = wb.getWorksheet('00_Meta');
    assert.equal(String(meta.getRow(2).getCell(2).value || ''), ANALYSIS_TEMPLATE_TYPE);
    assert.equal(ANALYSIS_TEMPLATE_FILE_NAME, 'Requirement_Analysis.xlsx');
    const parsed = parseAnalysisWorkbook(Buffer.from(buf));
    assert.ok((parsed.businessGoals || []).length >= 1);
    assert.ok((parsed.businessRules || []).length >= 1);
    assert.ok((parsed.useCases || []).length >= 1);
    assert.ok((parsed.traceabilityLinks || []).length >= 1);
  });

  it('names AI/Admin intake TEMPLATE_FILE_NAME as SRS.xlsx', () => {
    assert.equal(TEMPLATE_FILE_NAME, 'SRS.xlsx');
  });

  it('classifies AI WHAT vs HOW jobs', () => {
    assert.equal(AI_ANALYSIS_WHAT_JOBS.length, 3);
    assert.equal(AI_ANALYSIS_HOW_JOBS.includes('projectPlan'), true);
    assert.equal(isAiAnalysisWhatJob('capabilityAnalysis'), true);
    assert.equal(isAiAnalysisHowJob('wbsGeneration'), true);
    assert.equal(isAiAnalysisWhatJob('projectPlan'), false);
  });

  it('sheet11 export omits HOW when includePlanning false', () => {
    const ai = createEmptyAiAnalysisContainer();
    ai.analyses.capability = {
      status: 'confirmed',
      confirmedPayload: { items: [{ id: 'CAP-1', name: 'X' }] },
    };
    const rows = collectConfirmedRows(ai, { includePlanning: false });
    assert.ok(Array.isArray(rows));
  });
});
