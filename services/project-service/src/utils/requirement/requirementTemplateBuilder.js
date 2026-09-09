const ExcelJS = require('exceljs');
const {
  TEMPLATE_VERSION,
  TEMPLATE_FILE_NAME,
  SHEETS,
  SHEET_COLUMNS,
  OVERVIEW_FIELDS,
  PRIORITIES,
  FR_LEVELS,
} = require('../constants/requirementTemplate.constants');

async function buildRequirementTemplateBuffer() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VoiceHub';
  wb.created = new Date();

  const meta = wb.addWorksheet(SHEETS.META);
  meta.addRow(['Key', 'Value']);
  meta.addRow(['TemplateVersion', TEMPLATE_VERSION]);
  meta.addRow(['GeneratedAt', new Date().toISOString().slice(0, 10)]);

  const readme = wb.addWorksheet(SHEETS.README);
  readme.addRow(['REQUIREMENT TEMPLATE']);
  readme.addRow(['1. Do not rename sheets.']);
  readme.addRow(['2. Do not delete required columns.']);
  readme.addRow(['3. Do not change existing IDs once created.']);
  readme.addRow(['4. Fields marked * are required.']);
  readme.addRow(['5. Date format: YYYY-MM-DD.']);
  readme.addRow([`6. Priority: ${PRIORITIES.join(', ')}.`]);
  readme.addRow([`7. FR Level: ${FR_LEVELS.join(', ')}.`]);
  readme.addRow(['8. Parent ID must exist in the ID column. Epic has no Parent ID.']);
  readme.addRow([
    '9. Staffing: Story / Task / Subtask require Suggested Role. Task / Subtask (and Story without Task children) require Suggested Skills + Effort Hours (>0). Epic / Feature: Suggested Role optional.',
  ]);
  readme.addRow(['10. Optional overview: Start Date, Budget Currency.']);

  const overview = wb.addWorksheet(SHEETS.OVERVIEW);
  overview.addRow(SHEET_COLUMNS[SHEETS.OVERVIEW]);
  for (const field of OVERVIEW_FIELDS) {
    overview.addRow([field.label, field.required ? 'Yes' : 'No', '']);
  }

  const scope = wb.addWorksheet(SHEETS.SCOPE);
  scope.addRow(SHEET_COLUMNS[SHEETS.SCOPE]);
  scope.addRow(['In Scope', 'Authentication']);
  scope.addRow(['Out of Scope', 'Warehouse Management']);

  const fr = wb.addWorksheet(SHEETS.FUNCTIONAL);
  fr.addRow(SHEET_COLUMNS[SHEETS.FUNCTIONAL]);
  fr.addRow(['FR-001', 'Epic', '', 'Authentication', 'Quản lý xác thực', 'High', '']);
  fr.addRow(['FR-002', 'Feature', 'FR-001', 'User Authentication', '', 'High', '']);
  fr.addRow(['FR-003', 'Story', 'FR-002', 'Login', 'User can sign in', 'High', '', '', '', 'product_owner']);
  fr.addRow([
    'FR-004',
    'Task',
    'FR-003',
    'Login with email',
    'User login bằng email',
    'High',
    '',
    'React;REST API',
    '40',
    'frontend_developer',
  ]);

  const nfr = wb.addWorksheet(SHEETS.NFR);
  nfr.addRow(SHEET_COLUMNS[SHEETS.NFR]);
  nfr.addRow(['NFR-001', 'Performance', 'API response time', '< 2s', 'High']);

  const tech = wb.addWorksheet(SHEETS.TECHNOLOGY);
  tech.addRow(SHEET_COLUMNS[SHEETS.TECHNOLOGY]);
  tech.addRow(['Frontend', 'React', '19', 'Yes', '']);

  const integration = wb.addWorksheet(SHEETS.INTEGRATION);
  integration.addRow(SHEET_COLUMNS[SHEETS.INTEGRATION]);
  integration.addRow(['Payment Gateway', 'REST API', 'Outbound', 'Payment', 'Yes']);

  const constraints = wb.addWorksheet(SHEETS.CONSTRAINTS);
  constraints.addRow(SHEET_COLUMNS[SHEETS.CONSTRAINTS]);
  constraints.addRow(['Deadline', 'Production before 2026-12-30']);

  const deps = wb.addWorksheet(SHEETS.DEPENDENCIES);
  deps.addRow(SHEET_COLUMNS[SHEETS.DEPENDENCIES]);
  deps.addRow(['DEP-001', 'Payment API', 'External', '2026-10-01', 'High']);

  const asm = wb.addWorksheet(SHEETS.ASSUMPTIONS);
  asm.addRow(SHEET_COLUMNS[SHEETS.ASSUMPTIONS]);
  asm.addRow(['ASM-001', 'Payment provider provides API', 'High']);

  return wb.xlsx.writeBuffer();
}

module.exports = {
  buildRequirementTemplateBuffer,
  TEMPLATE_FILE_NAME,
};
