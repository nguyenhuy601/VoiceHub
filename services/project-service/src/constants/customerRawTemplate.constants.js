/**
 * Customer Requirement Raw workbook — customer-stated content only (ADR 0003).
 * No FR hierarchy / Given-When-Then AC / WBS / BA analysis sheets (BG/BR/BPM/UC).
 */

const CUSTOMER_RAW_TEMPLATE_VERSION = '1.1-raw';
const CUSTOMER_RAW_TEMPLATE_TYPE = 'CustomerRaw';
const CUSTOMER_RAW_FILE_NAME = 'Customer_Requirement_Raw.xlsx';

const CUSTOMER_RAW_SHEETS = Object.freeze({
  META: '00_Meta',
  README: 'README',
  CONTEXT: '01_Project_Context',
  BUSINESS_REQUEST: '02_Business_Request',
  REQUIREMENT: '03_Requirement',
  NFR: '04_NFR',
  REFERENCE: '05_Reference',
});

/** Field labels for 01_Project_Context (Field | Value | Guidance). */
const CUSTOMER_RAW_CONTEXT_FIELDS = Object.freeze([
  { field: 'Project ID', guidance: 'Mã dự án nếu đã có' },
  { field: 'Project Name', guidance: 'Tên dự án' },
  { field: 'Customer', guidance: 'Khách hàng' },
  { field: 'Business Domain', guidance: 'Lĩnh vực' },
  { field: 'Project Objective', guidance: 'Mục tiêu dự án' },
  { field: 'Business Problem', guidance: 'Vấn đề hiện tại (khách nêu)' },
  { field: 'Business Scope', guidance: 'Phạm vi tổng quát' },
  { field: 'In Scope', guidance: 'Những gì khách hàng muốn' },
  { field: 'Out of Scope', guidance: 'Những gì không nằm trong yêu cầu' },
  { field: 'Target Users', guidance: 'Đối tượng sử dụng' },
  { field: 'Expected Outcome', guidance: 'Kết quả mong muốn' },
  { field: 'Target Platform', guidance: 'Web / Mobile / Desktop / API…' },
  { field: 'Existing System', guidance: 'Hệ thống hiện tại nếu có' },
  { field: 'Integration', guidance: 'Hệ thống cần tích hợp' },
  { field: 'Constraint', guidance: 'Ràng buộc khách hàng biết trước' },
  { field: 'Deadline', guidance: 'Deadline mong muốn' },
  { field: 'Budget', guidance: 'Ngân sách nếu khách cung cấp' },
  { field: 'Priority', guidance: 'Mức độ ưu tiên tổng thể' },
  { field: 'Assumption', guidance: 'Giả định ban đầu' },
  { field: 'Source', guidance: 'Nguồn thông tin' },
]);

const CUSTOMER_RAW_SHEET_COLUMNS = Object.freeze({
  [CUSTOMER_RAW_SHEETS.META]: ['Key', 'Value'],
  [CUSTOMER_RAW_SHEETS.README]: ['Topic', 'Guidance'],
  [CUSTOMER_RAW_SHEETS.CONTEXT]: ['Field', 'Value', 'Guidance'],
  [CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST]: [
    'Request ID',
    'Request Title',
    'Customer Statement',
    'Business Problem',
    'Business Goal',
    'Expected Benefit',
    'Priority',
    'Stakeholder',
    'Source',
    'Date Raised',
    'Notes',
  ],
  [CUSTOMER_RAW_SHEETS.REQUIREMENT]: [
    'Requirement ID',
    'Request ID',
    'Requirement',
    'Requirement Type',
    'Module / Area',
    'User / Actor',
    'Priority',
    'Acceptance / Expected Result',
    'Source',
    'Source Detail',
    'Stakeholder',
    'Date Raised',
    'Customer Notes',
    'Attachment / Reference',
  ],
  [CUSTOMER_RAW_SHEETS.NFR]: [
    'NFR ID',
    'Category',
    'Customer Requirement',
    'Target',
    'Priority',
    'Source',
  ],
  [CUSTOMER_RAW_SHEETS.REFERENCE]: [
    'Reference ID',
    'Type',
    'Name',
    'Source',
    'Date',
    'Related Requirement',
  ],
});

const CUSTOMER_RAW_META_DEFAULTS = Object.freeze([
  ['TemplateType', CUSTOMER_RAW_TEMPLATE_TYPE],
  ['TemplateVersion', CUSTOMER_RAW_TEMPLATE_VERSION],
  ['Language', 'vi'],
  ['CustomerName', ''],
  ['ProjectName', ''],
  ['CollectedBy', ''],
  ['CollectedDate', ''],
]);

const CUSTOMER_RAW_README_ROWS = Object.freeze([
  [
    'Purpose',
    'Customer Requirement Raw: what the customer said (context, business requests, raw requirements, NFR, references). Not BA analysis.',
  ],
  [
    'Sheets',
    '01_Project_Context, 02_Business_Request, 03_Requirement (required content). 04_NFR, 05_Reference optional when customer provided them.',
  ],
  [
    'Next step',
    'BA maps CR → Requirement Analysis (BG/BR/BPM/FR/UC/NFR). Keep traceability; do not drop CRs.',
  ],
  [
    'Forbidden',
    'No FR/UC/BPM/BR/Architecture/Risk/WBS sheets. No Given/When/Then Acceptance Criteria. Do not invent NFR Targets — leave blank or mark Source=BA Proposal in Analysis.',
  ],
  [
    'Customer Statement',
    'Keep close to original customer language. Do not rewrite as "System shall…".',
  ],
]);

/** Example Value by Field for Course Registration demo. */
const CUSTOMER_RAW_CONTEXT_EXAMPLE_VALUES = Object.freeze({
  'Project Name': 'Course Registration Management',
  'Business Problem': 'Sinh viên đang đăng ký môn học thủ công',
  'Target Users': 'Student, Lecturer, Admin',
  'Target Platform': 'Web',
  Deadline: '2026-12-30',
  'Existing System': 'Excel',
  Integration: 'University SSO',
});

const CUSTOMER_RAW_EXAMPLE_ROWS = Object.freeze({
  [CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST]: [
    [
      'BRQ-001',
      'Online Course Registration',
      'Students should be able to register courses online.',
      'Students currently register manually using paper forms.',
      'Enable online course registration',
      'Reduce registration time and administrative workload.',
      'High',
      'Academic Department',
      'Workshop 2026-09-10',
      '2026-09-10',
      '',
    ],
  ],
  [CUSTOMER_RAW_SHEETS.REQUIREMENT]: [
    [
      'CR-001',
      'BRQ-001',
      'Student can search available courses',
      'Functional',
      'Course Registration',
      'Student',
      'High',
      '',
      'Workshop',
      'Requirement Workshop #1',
      'Academic Department',
      '2026-09-01',
      '',
      'REF-001',
    ],
    [
      'CR-002',
      'BRQ-001',
      'Student can register a course',
      'Functional',
      'Course Registration',
      'Student',
      'High',
      '',
      'Workshop',
      'Requirement Workshop #1',
      'Academic Department',
      '2026-09-01',
      '',
      'REF-001',
    ],
    [
      'CR-003',
      'BRQ-001',
      'Student cannot register when class is full',
      'Functional',
      'Course Registration',
      'Student',
      'High',
      'Registration is rejected when class capacity is reached.',
      'Workshop',
      'Requirement Workshop #1',
      'Academic Department',
      '2026-09-01',
      'Không cho đăng ký khi lớp đã đủ 50 người.',
      'REF-001',
    ],
    [
      'CR-004',
      'BRQ-001',
      'System should work on mobile',
      'Non-functional',
      'General',
      '',
      'Medium',
      '',
      'Workshop',
      'Requirement Workshop #1',
      'Academic Department',
      '2026-09-01',
      '',
      'REF-001',
    ],
  ],
  [CUSTOMER_RAW_SHEETS.NFR]: [
    [
      'NFR-001',
      'Performance',
      'API response should be fast',
      '< 2 sec',
      'High',
      'Workshop',
    ],
    [
      'NFR-002',
      'Availability',
      'System should be available continuously',
      '99.9%',
      'High',
      'Meeting',
    ],
    [
      'NFR-003',
      'Security',
      'Only authorized users can access data',
      '',
      'High',
      'Security document',
    ],
    [
      'NFR-004',
      'Scalability',
      'System should support many students',
      '10,000 users',
      'Medium',
      'Customer',
    ],
  ],
  [CUSTOMER_RAW_SHEETS.REFERENCE]: [
    [
      'REF-001',
      'Meeting',
      'Requirement Workshop #1',
      'Customer',
      '2026-09-01',
      'CR-001…CR-010',
    ],
    [
      'REF-002',
      'Document',
      'Existing Process.docx',
      'Customer',
      '2026-09-02',
      'CR-003',
    ],
    [
      'REF-003',
      'Email',
      'Registration Rules',
      'Customer',
      '2026-09-05',
      'CR-006',
    ],
    [
      'REF-004',
      'Image',
      'Current UI',
      'Customer',
      '2026-09-05',
      'CR-008',
    ],
  ],
});

module.exports = {
  CUSTOMER_RAW_TEMPLATE_VERSION,
  CUSTOMER_RAW_TEMPLATE_TYPE,
  CUSTOMER_RAW_FILE_NAME,
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_SHEET_COLUMNS,
  CUSTOMER_RAW_CONTEXT_FIELDS,
  CUSTOMER_RAW_CONTEXT_EXAMPLE_VALUES,
  CUSTOMER_RAW_META_DEFAULTS,
  CUSTOMER_RAW_README_ROWS,
  CUSTOMER_RAW_EXAMPLE_ROWS,
};
