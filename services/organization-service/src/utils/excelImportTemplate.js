const ExcelJS = require('exceljs');
const { PRIMARY_DOMAINS } = require('./resourceImportValidator');

const ORG_ROLES = ['member', 'hr', 'admin'];
/** Mirror DEFAULT_HR_ROLE_LABELS (mời 1 người / hrRoleCatalog) — tránh require shared ở unit test. */
const HR_ROLE_JOB_TITLES = [
  'Senior Backend',
  'Junior',
  'QA',
  'Architect',
  'Senior Frontend',
  'DevOps',
  'Intern',
];
/** Cùng EXTRA list form mời 1 người (UserCreatePanel). */
const EXTRA_JOB_TITLE_OPTIONS = [
  'Backend Developer',
  'Frontend Developer',
  'Fullstack Developer',
  'Mobile Developer',
  'QA Engineer',
  'Business Analyst',
  'Project Manager',
  'Product Designer',
  'DevOps Engineer',
  'Data Analyst',
  'Tech Lead',
];

/** Dòng 1 — key parser (chuẩn). */
const HEADERS = [
  'employeeCode',
  'fullName',
  'email',
  'phone',
  'departmentCode',
  'jobTitle',
  'primaryDomain',
  'skills',
  'yearsExperience',
  'maxConcurrentProjects',
  'orgRole',
];

/** Dòng 2 — chú thích tiếng Việt (không phải dữ liệu). */
const HEADER_HINTS = [
  'Mã NV (để trống)',
  'Họ tên',
  'Email',
  'SĐT',
  'Phòng ban',
  'Chức danh HR',
  'Chuyên môn (fe|be|…)',
  'Kỹ năng',
  'Số năm KN',
  'Trần số dự án (1–20)',
  'Vai trò công ty',
];

const COL = {
  departmentCode: 5,
  jobTitle: 6,
  primaryDomain: 7,
  orgRole: 11,
};

const DATA_ROWS = 200;

async function loadDepartmentNames(organizationId) {
  if (!organizationId) return [];
  const Department = require('../models/Department');
  const docs = await Department.find({
    organization: organizationId,
    isActive: { $ne: false },
  })
    .select('name')
    .sort({ name: 1 })
    .lean();
  const seen = new Set();
  const names = [];
  for (const d of docs || []) {
    const n = String(d?.name || '').trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(n);
  }
  return names;
}

function applyListValidation(ws, colNumber, formula, allowBlank, errorMsg, startRow = 3) {
  for (let r = startRow; r <= startRow + DATA_ROWS - 1; r += 1) {
    ws.getCell(r, colNumber).dataValidation = {
      type: 'list',
      allowBlank: Boolean(allowBlank),
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Giá trị không có trong danh sách',
      error:
        errorMsg ||
        'Chọn từ dropdown (đúng cấu trúc công ty lúc tải mẫu). Đổi phòng → tải mẫu lại.',
    };
  }
}

/** Snapshot chức danh = catalog mời + chức danh đã dùng (invite). Parser vẫn nhận gõ tay. */
function buildJobTitleSnapshot(extraTitles = []) {
  const set = new Set();
  for (const title of HR_ROLE_JOB_TITLES) set.add(title);
  for (const title of EXTRA_JOB_TITLE_OPTIONS) set.add(title);
  for (const title of extraTitles || []) {
    const raw = String(title || '').trim();
    if (raw) set.add(raw);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}

async function loadJobTitles(organizationId) {
  let fromDb = [];
  if (organizationId) {
    const CompanyInvite = require('../models/CompanyInvite');
    const docs = await CompanyInvite.find({ organization: organizationId })
      .select('jobTitle')
      .lean();
    fromDb = (docs || []).map((d) => d.jobTitle);
  }
  return buildJobTitleSnapshot(fromDb);
}

/**
 * Workbook mẫu HR — dropdown phòng live + enum domain/role.
 * File trên máy không tự cập nhật; mỗi GET template = snapshot DB lúc tải.
 */
async function buildWorkbookBufferFromLists({ deptNames = [], domains = [], jobTitles = [] } = {}) {
  const deptList = Array.isArray(deptNames) ? deptNames : [];
  const domainList = Array.isArray(domains) && domains.length
    ? domains
    : (Array.isArray(PRIMARY_DOMAINS) ? [...PRIMARY_DOMAINS] : []);
  const jobTitleList = buildJobTitleSnapshot(jobTitles);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'VoiceHub';
  const ws = wb.addWorksheet('resource_import', { views: [{ state: 'frozen', ySplit: 2 }] });
  const lists = wb.addWorksheet('lists');
  const notes = wb.addWorksheet('README');

  lists.getCell('A1').value = 'department';
  lists.getCell('B1').value = 'primaryDomain';
  lists.getCell('C1').value = 'orgRole';
  lists.getCell('D1').value = 'jobTitle';
  deptList.forEach((n, i) => {
    lists.getCell(i + 2, 1).value = n;
  });
  domainList.forEach((n, i) => {
    lists.getCell(i + 2, 2).value = n;
  });
  ORG_ROLES.forEach((n, i) => {
    lists.getCell(i + 2, 3).value = n;
  });
  jobTitleList.forEach((n, i) => {
    lists.getCell(i + 2, 4).value = n;
  });
  lists.state = 'hidden';

  ws.addRow(HEADERS);
  const hintRow = ws.addRow(HEADER_HINTS);
  hintRow.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
  hintRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
  const exampleDept = deptList[0] || '';
  const exampleJob = jobTitleList.includes('Backend Developer')
    ? 'Backend Developer'
    : (jobTitleList[0] || 'Backend Developer');
  ws.addRow([
    '',
    'Nguyễn An',
    'an.nguyen@company.com',
    '',
    exampleDept,
    exampleJob,
    'be',
    'NodeJS,MongoDB',
    1,
    2,
    'member',
  ]);

  const deptEnd = Math.max(2, deptList.length + 1);
  const domainEnd = Math.max(2, domainList.length + 1);
  const roleEnd = Math.max(2, ORG_ROLES.length + 1);
  const jobEnd = Math.max(2, jobTitleList.length + 1);
  if (deptList.length) {
    applyListValidation(ws, COL.departmentCode, `lists!$A$2:$A$${deptEnd}`, false);
  }
  applyListValidation(
    ws,
    COL.jobTitle,
    `lists!$D$2:$D$${jobEnd}`,
    false,
    'Gợi ý chức danh lúc tải mẫu (giống mời 1 người). Gõ tay chức danh khác vẫn được — Preview chỉ bắt buộc có chữ.'
  );
  applyListValidation(ws, COL.primaryDomain, `lists!$B$2:$B$${domainEnd}`, false);
  applyListValidation(ws, COL.orgRole, `lists!$C$2:$C$${roleEnd}`, true);

  notes.addRow(['Ghi chú template Excel HR (VoiceHub)']);
  notes.addRow([]);
  notes.addRow([
    'Mẫu & cấu trúc cty',
    'Mỗi lần Tải mẫu = snapshot phòng ban + chức danh + enum lúc đó. File đã lưu máy KHÔNG tự cập nhật. Đổi phòng/chức danh → tải mẫu lại rồi import.',
  ]);
  notes.addRow([
    '0 phòng',
    deptList.length
      ? `Đang có ${deptList.length} phòng trên org.`
      : 'Chưa có phòng — tạo phòng trên cấu trúc cty trước, rồi tải mẫu lại (cột departmentCode mới có dropdown).',
  ]);
  notes.addRow([
    'Header',
    'Dòng 1 = key chuẩn (employeeCode, jobTitle…). Dòng 2 = chú thích tiếng Việt — KHÔNG phải dữ liệu, máy bỏ qua. Đừng đổi tên dòng 1.',
  ]);
  notes.addRow(['employeeCode', 'Mã NV — để trống → hệ thống cấp VH-001…. CẤM NV001.']);
  notes.addRow([
    'departmentCode',
    'Phòng ban — CHỌN dropdown (tên phòng đúng HT). Gõ tay / file cũ lệch → Preview đỏ; sửa Excel hoặc tải mẫu lại.',
  ]);
  notes.addRow(['fullName', 'Họ tên — gõ tay, họ tên đầy đủ.']);
  notes.addRow(['email', 'Email NV. Domain phải thuộc allowlist công ty (nếu đã cấu hình).']);
  notes.addRow(['phone', 'SĐT — gõ tay hoặc trống. SĐT VN 10 số.']);
  notes.addRow([
    'jobTitle',
    `Chức danh HR — CHỌN dropdown (snapshot ${jobTitleList.length} mục, giống mời 1 người) hoặc GÕ TAY. Không phải Project Role.`,
  ]);
  notes.addRow(['primaryDomain', 'Chuyên môn — CHỌN: fe | be | fullstack | mobile | qa | ba | devops | other. Không phải chức danh.']);
  notes.addRow(['skills', 'Kỹ năng — tách bằng dấu phẩy hoặc ;']);
  notes.addRow(['yearsExperience', 'Số năm KN — số ≥ 0']);
  notes.addRow(['maxConcurrentProjects', 'Trần số dự án 1–20 — trống = 2. Soft OT / người.']);
  notes.addRow(['orgRole', 'Vai trò công ty — member | hr | admin. Trống = member. CẤM owner.']);
  notes.addRow(['System Role / Gói quyền', 'KHÔNG có cột — gán sau ở phân quyền.']);
  notes.addRow(['Luồng UI', 'Tải mẫu → điền Excel → Preview (máy quét) → 0 lỗi mới Confirm (lô 50). Không sửa trên web.']);
  notes.addRow(['Strict', 'Thiếu / sai 1 dòng → Preview fail, không Confirm. Sửa file rồi Preview lại.']);
  notes.addRow(['Giới hạn', 'Tối đa ~200 dòng/file. Confirm ghi tối đa 50/lô.']);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function buildResourceImportTemplateBuffer(organizationId) {
  const deptNames = await loadDepartmentNames(organizationId);
  const jobTitles = await loadJobTitles(organizationId);
  const domains = Array.isArray(PRIMARY_DOMAINS) ? [...PRIMARY_DOMAINS] : [];
  return buildWorkbookBufferFromLists({ deptNames, domains, jobTitles });
}

module.exports = {
  buildResourceImportTemplateBuffer,
  buildWorkbookBufferFromLists,
  buildJobTitleSnapshot,
  loadDepartmentNames,
  loadJobTitles,
  HEADERS,
  HEADER_HINTS,
  ORG_ROLES,
  EXTRA_JOB_TITLE_OPTIONS,
};
