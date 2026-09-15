/**
 * Build Requirement_Analysis.xlsx — BA WHAT workbook (7 sheets + Meta/README).
 * ADR 0003 — not SRS.xlsx (AI intake), not Customer Raw.
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const {
  ANALYSIS_TEMPLATE_VERSION,
  ANALYSIS_TEMPLATE_FILE_NAME,
  ANALYSIS_TEMPLATE_TYPE,
  ANALYSIS_SHEETS,
  ANALYSIS_SHEET_COLUMNS,
  ANALYSIS_README_ROWS,
} = require('../../constants/requirementAnalysisTemplate.constants');

const ASSET_PATH = path.join(__dirname, '../../../assets', ANALYSIS_TEMPLATE_FILE_NAME);

function addSheet(wb, name, columns, rows = []) {
  const ws = wb.addWorksheet(name);
  ws.addRow(columns);
  for (const row of rows) ws.addRow(row);
  return ws;
}

async function buildRequirementAnalysisTemplateBuffer() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VoiceHub';
  wb.created = new Date();

  addSheet(wb, ANALYSIS_SHEETS.META, ANALYSIS_SHEET_COLUMNS[ANALYSIS_SHEETS.META], [
    ['TemplateType', ANALYSIS_TEMPLATE_TYPE],
    ['TemplateVersion', ANALYSIS_TEMPLATE_VERSION],
    ['Language', 'en'],
  ]);

  addSheet(wb, ANALYSIS_SHEETS.README, ANALYSIS_SHEET_COLUMNS[ANALYSIS_SHEETS.README], [
    ...ANALYSIS_README_ROWS,
  ]);

  addSheet(wb, ANALYSIS_SHEETS.TRACEABILITY, ANALYSIS_SHEET_COLUMNS[ANALYSIS_SHEETS.TRACEABILITY], [
    ['BG-001', 'BG', 'CR-001', 'Workshop #1', 'Refined', 'Analyzed', ''],
    ['BR-001', 'BR', 'CR-001', 'Workshop #1', 'Derived', 'Analyzed', ''],
    ['BPM-001', 'BPM', 'CR-002', 'Workshop #1', 'Derived', 'Analyzed', ''],
    ['FR-001', 'FR', 'CR-001', 'Workshop #1', 'Refined', 'Analyzed', ''],
    ['FR-002', 'FR', 'CR-002', 'Workshop #1', 'Derived', 'Analyzed', ''],
    ['UC-001', 'UC', 'CR-002', 'Workshop #1', 'Derived', 'Analyzed', ''],
    ['NFR-001', 'NFR', 'CR-004', 'Workshop #1', 'Refined', 'Analyzed', 'Leave Target blank if unconfirmed'],
  ]);

  addSheet(wb, ANALYSIS_SHEETS.BG, ANALYSIS_SHEET_COLUMNS[ANALYSIS_SHEETS.BG], [
    [
      'BG-001',
      'CR-001',
      'Enable online course registration',
      'Students currently register manually using paper forms',
      'Reduce registration time and administrative workload',
      'Students can search and register courses online',
      'High',
      'Academic Department',
      'SSO available',
      'Must use campus SSO',
      'Draft',
      '',
    ],
  ]);

  addSheet(wb, ANALYSIS_SHEETS.BR, ANALYSIS_SHEET_COLUMNS[ANALYSIS_SHEETS.BR], [
    [
      'BR-001',
      'BG-001',
      'CR-001;CR-002',
      'The organization shall allow students to register courses online',
      'A student cannot register when class capacity is reached',
      'Academic Department',
      'High',
      'Registration succeeds when capacity remains',
      '',
      '',
      '',
      'Draft',
      '',
    ],
  ]);

  addSheet(wb, ANALYSIS_SHEETS.BPM, ANALYSIS_SHEET_COLUMNS[ANALYSIS_SHEETS.BPM], [
    [
      'BPM-001',
      'BR-001',
      'Register Course',
      'Student registers for an available course',
      'Student wants to enroll',
      'Student',
      'Student is authenticated',
      '1',
      'Student opens registration',
      'Course catalog',
      'Course list',
      '',
      '',
      'CR-002',
      'Draft',
      '',
    ],
    [
      'BPM-001',
      'BR-001',
      'Register Course',
      'Student registers for an available course',
      'Student wants to enroll',
      'System',
      'Student is authenticated',
      '2',
      'System validates class capacity',
      'Selected course',
      'Accept or reject',
      'Capacity rule',
      'Class full',
      'CR-003',
      'Draft',
      '',
    ],
  ]);

  addSheet(wb, ANALYSIS_SHEETS.FR, ANALYSIS_SHEET_COLUMNS[ANALYSIS_SHEETS.FR], [
    [
      'FR-M01',
      '',
      'Module',
      'Course Registration',
      '',
      '',
      '',
      'CR-001',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'High',
      '',
      '',
      '',
      'Draft',
      '',
    ],
    [
      'FR-C01',
      'FR-M01',
      'Capability',
      'Course Registration',
      'Course Enrollment',
      '',
      '',
      'CR-001;CR-002',
      'BR-001',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'High',
      '',
      '',
      '',
      'Draft',
      '',
    ],
    [
      'FR-F01',
      'FR-C01',
      'Feature',
      'Course Registration',
      'Course Enrollment',
      'Online Register',
      '',
      'CR-002',
      'BR-001',
      'BPM-001',
      'Student',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'High',
      '',
      '',
      '',
      'Draft',
      '',
    ],
    [
      'FR-001',
      'FR-F01',
      'Requirement',
      'Course Registration',
      'Course Enrollment',
      'Online Register',
      'Student can register a course',
      'CR-002',
      'BR-001',
      'BPM-001',
      'Student',
      'Student selects a course',
      'Student is logged in',
      'System records enrollment when capacity allows',
      'Reject when class is full',
      'Course ID',
      'Enrollment record',
      'Class full',
      'Enrollment is created when capacity remains',
      'High',
      '',
      '',
      '',
      'Draft',
      '',
    ],
    [
      'FR-002',
      'FR-F01',
      'Requirement',
      'Course Registration',
      'Course Enrollment',
      'Online Register',
      'Student can search available courses',
      'CR-001',
      'BR-001',
      'BPM-001',
      'Student',
      'Student opens search',
      'Student is logged in',
      'System returns matching courses',
      '',
      'Search query',
      'Course list',
      '',
      'Matching courses are listed',
      'High',
      '',
      '',
      '',
      'Draft',
      '',
    ],
  ]);

  addSheet(wb, ANALYSIS_SHEETS.UC, ANALYSIS_SHEET_COLUMNS[ANALYSIS_SHEETS.UC], [
    [
      'UC-001',
      'FR-001',
      'BR-001',
      'CR-002',
      'Register Course',
      'Enroll in a course online',
      'Student',
      '',
      'Student selects Register',
      'Student is authenticated',
      'Enrollment recorded or rejected',
      '1. Select course 2. Confirm 3. System validates capacity 4. System records or rejects',
      '',
      'Class is full',
      'Capacity rule',
      'Course ID',
      'Enrollment status',
      'High',
      'Draft',
      '',
    ],
  ]);

  addSheet(wb, ANALYSIS_SHEETS.NFR, ANALYSIS_SHEET_COLUMNS[ANALYSIS_SHEETS.NFR], [
    [
      'NFR-001',
      'CR-004',
      'Usability',
      'System should work on mobile',
      '',
      '',
      'Medium',
      'Web client',
      '',
      'Usable on common mobile browsers',
      'Customer workshop',
      'Draft',
      'Target left blank — not confirmed by customer',
    ],
  ]);

  return wb.xlsx.writeBuffer();
}

async function writeRequirementAnalysisTemplateAsset() {
  const buf = await buildRequirementAnalysisTemplateBuffer();
  await fs.promises.mkdir(path.dirname(ASSET_PATH), { recursive: true });
  await fs.promises.writeFile(ASSET_PATH, Buffer.from(buf));
  return ASSET_PATH;
}

async function loadRequirementAnalysisTemplateBuffer() {
  try {
    return await fs.promises.readFile(ASSET_PATH);
  } catch {
    return buildRequirementAnalysisTemplateBuffer();
  }
}

function getRequirementAnalysisTemplateAssetPath() {
  return ASSET_PATH;
}

module.exports = {
  buildRequirementAnalysisTemplateBuffer,
  writeRequirementAnalysisTemplateAsset,
  loadRequirementAnalysisTemplateBuffer,
  getRequirementAnalysisTemplateAssetPath,
  ANALYSIS_TEMPLATE_FILE_NAME,
};
