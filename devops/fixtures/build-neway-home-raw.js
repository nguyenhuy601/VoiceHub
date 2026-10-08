/**
 * Map bảng mô tả Neway Home (sheet TRANG CHỦ) → Customer_Requirement_Raw.xlsx
 *
 * Usage:
 *   node devops/fixtures/build-neway-home-raw.js
 *   node devops/fixtures/build-neway-home-raw.js "C:/path/to/source.xlsx"
 */
const path = require('path');
const fs = require('fs');
const ExcelJS = require(path.join(
  __dirname,
  '../../services/project-service/node_modules/exceljs'
));
const XLSX = require(path.join(
  __dirname,
  '../../services/project-service/node_modules/xlsx'
));
const {
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_SHEET_COLUMNS,
  CUSTOMER_RAW_CONTEXT_FIELDS,
  CUSTOMER_RAW_META_DEFAULTS,
  CUSTOMER_RAW_README_ROWS,
  CUSTOMER_RAW_TEMPLATE_TYPE,
  CUSTOMER_RAW_TEMPLATE_VERSION,
} = require('../../services/project-service/src/constants/customerRawTemplate.constants');

const DEFAULT_SOURCE = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'dtlt-Neway-Home - 019725W.xlsx'
);
const OUT_FIXTURE = path.join(__dirname, 'Customer_Requirement_Raw_Neway_Home.xlsx');
const OUT_DOWNLOADS = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'Customer_Requirement_Raw_Neway_Home.xlsx'
);

const SOURCE_LABEL = 'Bảng mô tả chi tiết dự án — HĐ 041326W (dtlt-Neway-Home - 019725W.xlsx)';
const COLLECTED_DATE = '2026-10-07';

/** Infer module when NHÓM CHỨC NĂNG trống (dòng 1–6). */
const DEFAULT_MODULE = 'Danh mục & phân quyền';

function addSheet(wb, name, columns, rows = []) {
  const ws = wb.addWorksheet(name);
  ws.addRow(columns);
  for (const row of rows) ws.addRow(row);
  ws.getRow(1).font = { bold: true };
  return ws;
}

function readSourceFeatures(sourcePath) {
  const wb = XLSX.readFile(sourcePath, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
  });

  const header = {};
  for (let i = 0; i <= 16; i += 1) {
    const label = String(rows[i]?.[0] || '').trim();
    const value = String(rows[i]?.[4] || '').trim();
    if (label) header[label] = value;
  }

  const features = [];
  let lastGroup = DEFAULT_MODULE;
  for (let i = 18; i < rows.length; i += 1) {
    const stt = String(rows[i][0] || '').trim();
    const group = String(rows[i][1] || '').trim();
    const name = String(rows[i][2] || '').trim();
    const desc = String(rows[i][3] || '').trim();
    const responsive = String(rows[i][4] || '').trim();
    const note = String(rows[i][5] || '').trim();
    if (group) lastGroup = group;
    if (!name && !desc) continue;
    features.push({
      stt,
      group: group || lastGroup,
      name,
      desc,
      responsive,
      note,
    });
  }

  return { header, features, sheetName };
}

function assignBrqId(group, name) {
  const g = String(group || '').toUpperCase();
  const n = String(name || '').toUpperCase();
  if (g.includes('QUẢN LÝ DỰ ÁN') || n.includes('DỰ ÁN') || n.includes('GIAO DỊCH')) {
    return 'BRQ-002';
  }
  if (
    g.includes('BÁO CÁO') ||
    n.includes('BÁO CÁO') ||
    n.includes('LƯƠNG') ||
    n.includes('UỶ NHIỆM') ||
    n.includes('ỦY NHIỆM')
  ) {
    if (n === 'LỊCH' || n === 'THÔNG BÁO' || n.includes('SƠ ĐỒ')) return 'BRQ-004';
    return 'BRQ-003';
  }
  return 'BRQ-001';
}

function buildBusinessRequests() {
  return [
    [
      'BRQ-001',
      'Danh mục tổ chức, vai trò và phân quyền',
      'Cần quản lý vai trò, phân quyền, khu vực/chi nhánh, team, nhân sự và khách hàng thuê trên hệ thống web.',
      'Danh mục vận hành môi giới thuê phòng đang quản lý rời rạc; cần chuẩn hóa master data và quyền truy cập.',
      'Có danh mục Vai trò / Phân quyền / Khu vực-Chi nhánh / Team / Nhân sự / Khách hàng, tìm kiếm-lọc-CRUD, cảnh báo trùng.',
      'Giảm sai sót master data; phân quyền theo vai trò; nền tảng cho dự án thuê và hoa hồng.',
      'High',
      'Nguyễn Minh Thuận; Đặng Phương Nam',
      SOURCE_LABEL,
      COLLECTED_DATE,
      'Nhóm chức năng 1–6 trên file nguồn (một số dòng thiếu cột NHÓM).',
    ],
    [
      'BRQ-002',
      'Quản lý dự án thuê phòng và giao dịch',
      'Cần tạo/quản lý thông tin dự án thuê (nhân sự hoa hồng M/S, phòng, cọc, doanh thu ước tính) và xác nhận giao dịch kế toán.',
      'Quy trình dự án–giao dịch–cọc–khớp lệnh phức tạp, dễ lệch tỉ lệ hoa hồng và trạng thái thu.',
      'Quản lý thông tin dự án + giao dịch (thành công / huỷ-hoàn cọc), tính doanh thu thực tế, khớp lệnh, trạng thái đã thu/chưa thu.',
      'Minh bạch hoa hồng và dòng tiền theo từng dự án/giao dịch.',
      'High',
      'Kế toán; Quản lý Neway Home',
      SOURCE_LABEL,
      COLLECTED_DATE,
      'Nhóm QUẢN LÝ DỰ ÁN trên file nguồn.',
    ],
    [
      'BRQ-003',
      'Báo cáo thống kê, tính lương hoa hồng và uỷ nhiệm chi',
      'Cần báo cáo doanh thu/giao dịch/hoa hồng/khu vực, tính lương-hoa hồng theo tỉ lệ vai trò, và quy trình uỷ nhiệm chi có duyệt kế toán.',
      'Báo cáo và payroll hoa hồng đang phụ thuộc thao tác thủ công; chi phí/hoàn cọc/ứng lương cần kiểm soát duyệt.',
      'Báo cáo xuất Excel/PDF; bảng lương theo nhân sự/team/chi nhánh; uỷ nhiệm chi nhiều loại với trạng thái duyệt.',
      'Giảm thời gian tổng hợp; kiểm soát chi và thuế/BHXH theo rule khách nêu.',
      'High',
      'Kế toán; Leader team',
      SOURCE_LABEL,
      COLLECTED_DATE,
      'Nhóm BÁO CÁO — các mục có mô tả chi tiết.',
    ],
    [
      'BRQ-004',
      'Lịch, thông báo và sơ đồ tổ chức',
      'Có nhu cầu chức năng Lịch, Thông báo, Sơ đồ tổ chức (mới nêu tên trên bảng mô tả).',
      'Chưa có mô tả chi tiết trên file nguồn.',
      'Bổ sung mô tả chi tiết trước khi phân tích BA / implement.',
      'Hoàn thiện trải nghiệm vận hành nội bộ (lịch/nhắc/org chart).',
      'Medium',
      'Quản lý Neway Home',
      SOURCE_LABEL,
      COLLECTED_DATE,
      'INCOMPLETE trên nguồn — chỉ có tiêu đề, chưa có mô tả.',
    ],
  ];
}

function buildRequirements(features) {
  const rows = [];
  let cr = 0;
  for (const f of features) {
    cr += 1;
    const id = `CR-${String(cr).padStart(3, '0')}`;
    const brq = assignBrqId(f.group, f.name);
    const incomplete = !f.desc;
    const requirementText = incomplete
      ? `${f.name} (chưa có mô tả chi tiết trên file nguồn)`
      : f.desc.length > 800
        ? `${f.name}: ${f.desc}`
        : `${f.name}. ${f.desc}`;
    const customerNotes = [
      incomplete ? 'INCOMPLETE: chỉ có tên chức năng trên file nguồn — cần BA làm rõ với khách.' : '',
      f.note || '',
      f.responsive ? `Responsive note: ${f.responsive}` : '',
      f.stt ? `STT nguồn: ${f.stt}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    rows.push([
      id,
      brq,
      requirementText,
      'Functional',
      f.group || DEFAULT_MODULE,
      '',
      incomplete ? 'Medium' : 'High',
      '',
      'Document',
      SOURCE_LABEL,
      'Neway Home',
      COLLECTED_DATE,
      customerNotes,
      'REF-001',
    ]);
  }
  return rows;
}

function buildContext(header) {
  const customer = header['TÊN HỢP ĐỒNG'] || 'CÔNG TY TNHH NEWAY HOME';
  const contractCode = header['MÃ HĐ'] || header['MÃ HĐ'] || '041326W';
  const webType = header['LOẠI WEB'] || 'Responsive + SSL';
  const values = {
    'Project ID': contractCode,
    'Project Name': `Hệ thống vận hành Neway Home (${contractCode})`,
    Customer: customer,
    'Business Domain': 'Môi giới / cho thuê phòng (BĐS vận hành nội bộ)',
    'Project Objective':
      'Xây web quản lý vận hành môi giới thuê phòng: danh mục tổ chức, dự án thuê, giao dịch cọc, báo cáo, lương hoa hồng và uỷ nhiệm chi.',
    'Business Problem':
      'Cần số hóa quy trình dự án thuê–giao dịch–hoa hồng–báo cáo theo bảng mô tả chi tiết hợp đồng (file nguồn chưa nêu vấn đề as-is tường minh).',
    'Business Scope':
      'Web responsive quản lý vai trò/phân quyền, khu vực-chi nhánh-team-nhân sự-khách hàng, dự án thuê & giao dịch, báo cáo/thống kê, tính lương hoa hồng, uỷ nhiệm chi; các mục Lịch/Thông báo/Sơ đồ tổ chức còn thiếu mô tả.',
    'In Scope':
      'Vai trò; Phân quyền; Danh mục khu vực/chi nhánh, team, nhân sự, khách hàng; Quản lý thông tin dự án; Quản lý giao dịch; Báo cáo & thống kê; Tính lương & hoa hồng; Uỷ nhiệm chi; Responsive + SSL.',
    'Out of Scope':
      'Chưa nêu trên file nguồn (mobile native, tích hợp kế toán ngoài, CI/CD…). Các mục Lịch / Thông báo / Sơ đồ tổ chức chưa đủ mô tả để coi là scope đã chốt.',
    'Target Users':
      'Nhân sự sale/marketing, Leader team, Kế toán, Quản lý Neway Home, Admin hệ thống',
    'Expected Outcome':
      'Quản lý được dự án thuê và giao dịch; tính được hoa hồng/lương theo rule; xuất báo cáo; kiểm soát uỷ nhiệm chi có duyệt.',
    'Target Platform': webType.includes('Responsive') ? 'Web (Responsive) + SSL' : webType,
    'Existing System': header['TRANG WEB TƯƠNG TỰ'] || '(không ghi trên file nguồn)',
    Integration: header['LINK DEMO']
      ? `Link demo: ${header['LINK DEMO']}`
      : '(không ghi trên file nguồn)',
    Constraint:
      'Quy tắc tỉ lệ hoa hồng M/S và thuế/BHXH theo mô tả chức năng; mỗi giao dịch cần kế toán xác nhận; uỷ nhiệm chi duyệt qua kế toán và người đứng đầu kế toán.',
    Deadline: '(không ghi trên file nguồn)',
    Budget: '(không ghi trên file nguồn)',
    Priority: 'High',
    Assumption:
      'File nguồn là SoT lời khách cho phạm vi chức năng đã mô tả; mã HĐ trên sheet là 041326W (tên file có 019725W — cần xác nhận với khách nếu lệch).',
    Source: SOURCE_LABEL,
  };
  return CUSTOMER_RAW_CONTEXT_FIELDS.map((f) => [f.field, values[f.field] || '', f.guidance]);
}

function buildNfrs() {
  return [
    [
      'NFR-001',
      'Compatibility',
      'Website hỗ trợ Responsive',
      'Responsive',
      'High',
      SOURCE_LABEL,
    ],
    [
      'NFR-002',
      'Security',
      'Website dùng SSL',
      'SSL',
      'High',
      SOURCE_LABEL,
    ],
    [
      'NFR-003',
      'Security',
      'Phân quyền người dùng theo từng nhóm vai trò',
      '',
      'High',
      SOURCE_LABEL,
    ],
  ];
}

function buildReferences(features) {
  const crRange = features.length
    ? `CR-001…CR-${String(features.length).padStart(3, '0')}`
    : '';
  return [
    [
      'REF-001',
      'Document',
      'dtlt-Neway-Home - 019725W.xlsx — Bảng mô tả chi tiết dự án lập trình',
      'Customer',
      COLLECTED_DATE,
      crRange,
    ],
    [
      'REF-002',
      'Document',
      'Hợp đồng / mã HĐ 041326W — CÔNG TY TNHH NEWAY HOME',
      'Customer',
      COLLECTED_DATE,
      '01_Project_Context; BRQ-001…BRQ-004',
    ],
  ];
}

async function main() {
  const sourcePath = path.resolve(process.argv[2] || DEFAULT_SOURCE);
  if (!fs.existsSync(sourcePath)) {
    console.error('Source not found:', sourcePath);
    process.exit(1);
  }

  const { header, features } = readSourceFeatures(sourcePath);
  const businessRequests = buildBusinessRequests();
  const requirements = buildRequirements(features);
  const nfrs = buildNfrs();
  const references = buildReferences(features);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'VoiceHub';
  wb.created = new Date();

  const metaRows = CUSTOMER_RAW_META_DEFAULTS.map(([k, v]) => {
    const map = {
      TemplateType: CUSTOMER_RAW_TEMPLATE_TYPE,
      TemplateVersion: CUSTOMER_RAW_TEMPLATE_VERSION,
      Language: 'vi',
      CustomerName: header['TÊN HỢP ĐỒNG'] || 'CÔNG TY TNHH NEWAY HOME',
      ProjectName: `Neway Home — HĐ ${header['MÃ HĐ'] || header['MÃ HĐ'] || '041326W'}`,
      CollectedBy: 'Mapped from customer workbook',
      CollectedDate: COLLECTED_DATE,
    };
    return [k, map[k] !== undefined ? map[k] : v];
  });

  addSheet(wb, CUSTOMER_RAW_SHEETS.META, CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.META], metaRows);
  addSheet(wb, CUSTOMER_RAW_SHEETS.README, CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.README], [
    ...CUSTOMER_RAW_README_ROWS,
    [
      'Mapping note',
      'Mapped from Neway Home detail sheet TRANG CHỦ. Incomplete items (Lịch, Thông báo, Sơ đồ tổ chức) flagged in Customer Notes. README itself is not AI content.',
    ],
  ]);
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.CONTEXT,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.CONTEXT],
    buildContext(header)
  );
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST],
    businessRequests
  );
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.REQUIREMENT,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.REQUIREMENT],
    requirements
  );
  addSheet(wb, CUSTOMER_RAW_SHEETS.NFR, CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.NFR], nfrs);
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.REFERENCE,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.REFERENCE],
    references
  );

  await wb.xlsx.writeFile(OUT_FIXTURE);
  try {
    await wb.xlsx.writeFile(OUT_DOWNLOADS);
  } catch (err) {
    console.warn('Could not write Downloads copy:', err.message);
  }

  const {
    validateCustomerRawForm,
  } = require('../../services/project-service/src/utils/requirement/customerRawFormValidate');
  const result = validateCustomerRawForm(fs.readFileSync(OUT_FIXTURE));
  if (!result.ok) {
    console.error('Form INVALID', result);
    process.exit(1);
  }

  console.log('Source:', sourcePath);
  console.log('Wrote:', OUT_FIXTURE);
  if (fs.existsSync(OUT_DOWNLOADS)) console.log('Wrote:', OUT_DOWNLOADS);
  console.log('Form OK:', result.ok, 'type:', result.templateType, 'version:', result.templateVersion);
  console.log(
    `Counts: features=${features.length}, BRQ=${businessRequests.length}, CR=${requirements.length}, NFR=${nfrs.length}, REF=${references.length}`
  );
  const incomplete = features.filter((f) => !f.desc).map((f) => f.name);
  if (incomplete.length) console.log('Incomplete (no desc):', incomplete.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
