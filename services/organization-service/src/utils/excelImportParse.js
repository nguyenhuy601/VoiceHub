const XLSX = require('xlsx');
const { PAST_PROJECT_MAX, parsePastProjectBlocks } = require('./parsePastProjectBlocks');

function resolveImportMaxRows() {
  return Math.max(1, Math.min(500, Number(process.env.IMPORT_MAX_ROWS || 200) || 200));
}

function isBlankExcelRow(rowArr) {
  if (!Array.isArray(rowArr) || rowArr.length === 0) return true;
  return rowArr.every((c) => String(c ?? '').trim() === '');
}

function normalizeHeaderToken(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[….]/g, '')
    .replace(/\s+/g, ' ');
}

/** Dòng chú thích tiếng Việt dưới header — không import. */
const HEADER_HINT_TOKENS = new Set(
  [
    'mã nv (để trống)',
    'mã nv',
    'họ tên',
    'sđt',
    'phòng ban',
    'chức danh hr',
    'chuyên môn',
    'chuyên môn (fe|be|…)',
    'chuyên môn (fe|be)',
    'chuyên môn (frontend|backend|…)',
    'chuyên môn (frontend|backend)',
    'kỹ năng',
    'kỹ năng (đúng lists!e, phẩy)',
    'kỹ năng (dung lists!e, phay)',
    'kỹ năng 1 (dropdown)',
    'kỹ năng 2 (dropdown)',
    'kỹ năng 3 (dropdown)',
    'kỹ năng 4 (dropdown)',
    'kỹ năng 5 (dropdown)',
    'ky nang 1 (dropdown)',
    'kỹ năng 1',
    'kỹ năng 2',
    'kỹ năng 3',
    'kỹ năng 4',
    'kỹ năng 5',
    'số năm kn',
    'trần số dự án (1–20)',
    'trần số dự án (1-20)',
    'vai trò công ty',
    'tên da 1 (hr chọn theo jd)',
    'tên da 1 (hr chon theo jd)',
    'vai trò da 1',
    'vai tro da 1',
    'việc đã xử lý da 1',
    'viec da xu ly da 1',
    'việc + công nghệ da 1',
    'viec + cong nghe da 1',
    'năm da 1',
    'nam da 1',
  ].map((s) => normalizeHeaderToken(s))
);

function isHeaderHintRow(rowArr) {
  if (!Array.isArray(rowArr)) return false;
  let hits = 0;
  for (const c of rowArr) {
    const t = normalizeHeaderToken(c);
    if (t && HEADER_HINT_TOKENS.has(t)) hits += 1;
  }
  return hits >= 3;
}

/** Header Excel (Anh hoặc Việt) → key nội bộ. */
const HEADER_ALIASES = {
  employeeCode: ['employeecode', 'employee code', 'mã nv', 'ma nv', 'mã nv (để trống)', 'ma nv (de trong)'],
  fullName: ['fullname', 'displayName', 'displayname', 'hoten', 'họ tên', 'ho ten', 'họ và tên'],
  email: ['email', 'e-mail', 'mail'],
  phone: ['phone', 'sdt', 'sđt', 'sodienthoai', 'số đt', 'so dt', 'điện thoại', 'dien thoai'],
  departmentCode: ['departmentcode', 'department', 'phòng ban', 'phong ban'],
  jobTitle: ['jobtitle', 'chức danh hr', 'chuc danh hr', 'chức danh', 'chuc danh'],
  primaryDomain: [
    'primarydomain',
    'domain',
    'chuyên môn',
    'chuyen mon',
    'chuyên môn (fe/be/…)',
    'chuyên môn (fe/be)',
  ],
  skills: [
    'skills',
    'kỹ năng',
    'ky nang',
    'kỹ năng (phẩy, ≤10, lists!e)',
    'ky nang (phay, <=10, lists!e)',
  ],
  skill1: ['skill1', 'skill 1', 'kỹ năng 1', 'ky nang 1', 'kỹ năng 1 (dropdown)'],
  skill2: ['skill2', 'skill 2', 'kỹ năng 2', 'ky nang 2', 'kỹ năng 2 (dropdown)'],
  skill3: ['skill3', 'skill 3', 'kỹ năng 3', 'ky nang 3', 'kỹ năng 3 (dropdown)'],
  skill4: ['skill4', 'skill 4', 'kỹ năng 4', 'ky nang 4', 'kỹ năng 4 (dropdown)'],
  skill5: ['skill5', 'skill 5', 'kỹ năng 5', 'ky nang 5', 'kỹ năng 5 (dropdown)'],
  yearsExperience: ['yearsexperience', 'số năm kn', 'so nam kn', 'số năm kinh nghiệm', 'years'],
  maxConcurrentProjects: [
    'maxconcurrentprojects',
    'maxconcurrent',
    'trần số dự án',
    'tran so du an',
    'trần số dự án (1–20)',
    'trần số dự án (1-20)',
  ],
  orgRole: ['orgrole', 'vai trò công ty', 'vai tro cong ty', 'vai trò org', 'org role'],
};

for (let n = 1; n <= PAST_PROJECT_MAX; n += 1) {
  HEADER_ALIASES[`pastProject${n}Name`] = [
    `pastproject${n}name`,
    `past project ${n} name`,
    `tên da ${n}`,
    `ten da ${n}`,
    `tên da ${n} (hr chọn theo jd)`,
    `tên da ${n} (hr chon theo jd)`,
  ];
  HEADER_ALIASES[`pastProject${n}Role`] = [
    `pastproject${n}role`,
    `past project ${n} role`,
    `vai trò da ${n}`,
    `vai tro da ${n}`,
  ];
  HEADER_ALIASES[`pastProject${n}Work`] = [
    `pastproject${n}work`,
    `past project ${n} work`,
    `việc đã xử lý da ${n}`,
    `viec da xu ly da ${n}`,
  ];
  HEADER_ALIASES[`pastProject${n}Year`] = [
    `pastproject${n}year`,
    `past project ${n} year`,
    `năm da ${n}`,
    `nam da ${n}`,
  ];
}

const HEADER_TO_CANONICAL = new Map();
for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
  HEADER_TO_CANONICAL.set(normalizeHeaderToken(canonical), canonical);
  for (const a of aliases) {
    HEADER_TO_CANONICAL.set(normalizeHeaderToken(a), canonical);
  }
}

function resolveCanonicalHeader(raw) {
  return HEADER_TO_CANONICAL.get(normalizeHeaderToken(raw)) || '';
}

/** Gộp cột skills (phẩy) + legacy skill1…5 → 1 chuỗi cho validator. */
function mergeSkillCells(skillsComma, skillSlots) {
  const parts = [];
  for (const slot of skillSlots || []) {
    const t = String(slot ?? '').trim();
    if (t) parts.push(t);
  }
  const comma = String(skillsComma ?? '').trim();
  if (comma) parts.push(comma);
  return parts.join(', ');
}

/**
 * SheetJS used-range phình vì dataValidation 200 dòng trên mẫu exceljs.
 * Bỏ dòng trống — chỉ giữ dòng có dữ liệu.
 * Header dòng 1 = key Anh. Dòng 2 chú thích VI (bỏ qua). File cũ chỉ EN hoặc đã đổi tên cột VI vẫn parse.
 */
function parseExcelToRawRows(fileBuffer, dataLimit = resolveImportMaxRows()) {
  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) throw new Error('Excel file missing sheet');

  const sheet = wb.Sheets[sheetName];
  const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!Array.isArray(rows2d) || rows2d.length < 2) {
    throw Object.assign(new Error('Excel has no data rows'), {
      statusCode: 400,
      errorCode: 'VALIDATION_REQUIRED',
    });
  }

  const headerRow = rows2d[0];
  const headerIndex = {};
  for (let i = 0; i < headerRow.length; i += 1) {
    const canonical = resolveCanonicalHeader(headerRow[i]);
    if (!canonical) continue;
    headerIndex[canonical.toLowerCase()] = i;
  }

  const getCell = (row, key) => {
    const idx = headerIndex[String(key).toLowerCase()];
    if (idx == null) return '';
    return row[idx];
  };

  const normalizedRowsRaw = [];
  for (let i = 1; i < rows2d.length && normalizedRowsRaw.length < dataLimit; i += 1) {
    const rowArr = rows2d[i];
    if (isBlankExcelRow(rowArr) || isHeaderHintRow(rowArr)) continue;
    const rowNumber = i + 1;
    const pastFields = {};
    for (let n = 1; n <= PAST_PROJECT_MAX; n += 1) {
      pastFields[`pastProject${n}Name`] = getCell(rowArr, `pastproject${n}name`);
      pastFields[`pastProject${n}Role`] = getCell(rowArr, `pastproject${n}role`);
      pastFields[`pastProject${n}Work`] = getCell(rowArr, `pastproject${n}work`);
      pastFields[`pastProject${n}Year`] = getCell(rowArr, `pastproject${n}year`);
    }
    normalizedRowsRaw.push({
      rowNumber,
      employeeCode: getCell(rowArr, 'employeecode'),
      fullName: getCell(rowArr, 'fullname') || getCell(rowArr, 'displayname') || getCell(rowArr, 'hoten'),
      email: getCell(rowArr, 'email'),
      phone: getCell(rowArr, 'phone') || getCell(rowArr, 'sodienthoai') || getCell(rowArr, 'sdt'),
      departmentCode: getCell(rowArr, 'departmentcode'),
      jobTitle: getCell(rowArr, 'jobtitle'),
      primaryDomain: getCell(rowArr, 'primarydomain') || getCell(rowArr, 'domain'),
      skills: mergeSkillCells(getCell(rowArr, 'skills'), [
        getCell(rowArr, 'skill1'),
        getCell(rowArr, 'skill2'),
        getCell(rowArr, 'skill3'),
        getCell(rowArr, 'skill4'),
        getCell(rowArr, 'skill5'),
      ]),
      yearsExperience: getCell(rowArr, 'yearsexperience'),
      maxConcurrentProjects: getCell(rowArr, 'maxconcurrentprojects'),
      orgRole: getCell(rowArr, 'orgrole'),
      ...pastFields,
    });
  }
  return normalizedRowsRaw;
}

module.exports = {
  parseExcelToRawRows,
  mergeSkillCells,
  parsePastProjectBlocks,
  isBlankExcelRow,
  isHeaderHintRow,
  resolveImportMaxRows,
  resolveCanonicalHeader,
  HEADER_ALIASES,
};
