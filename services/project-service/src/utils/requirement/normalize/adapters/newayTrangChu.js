/**
 * Adapter: Neway-style TRANG CHỦ bảng mô tả → Customer Raw row payloads.
 * RULE-01: missing fields stay blank — do not invent BRQ/NFR/Deadline prose.
 */

const XLSX = require('xlsx');
const {
  CUSTOMER_RAW_CONTEXT_FIELDS,
} = require('../../../../constants/customerRawTemplate.constants');
const { sheetMatrix } = require('../detectCustomerWorkbookProfile');

function cell(row, idx) {
  return String(row?.[idx] ?? '').trim();
}

function findHeaderValue(headerMap, candidates) {
  for (const [label, value] of Object.entries(headerMap)) {
    const n = String(label || '')
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    for (const c of candidates) {
      if (n === c || n.includes(c)) {
        const v = String(value || '').trim();
        if (v) return v;
      }
    }
  }
  return '';
}

/**
 * @param {object} workbook — SheetJS workbook
 * @param {{ sheetName: string, featureHeaderRow: number }} meta
 * @param {{ fileName?: string }} [opts]
 */
function mapNewayTrangChuToRawPayload(workbook, meta, opts = {}) {
  const sheetName = meta.sheetName || (workbook.SheetNames || [])[0];
  const rows = sheetMatrix(workbook, sheetName);
  const headerRowIdx = Number(meta.featureHeaderRow);
  if (!Number.isFinite(headerRowIdx) || headerRowIdx < 0) {
    return emptyPayload();
  }

  /** @type {Record<string, string>} */
  const headerMap = {};
  for (let i = 0; i < headerRowIdx; i += 1) {
    const label = cell(rows[i], 0);
    const value = cell(rows[i], 4) || cell(rows[i], 3) || cell(rows[i], 1);
    if (label) headerMap[label] = value;
  }

  const customer = findHeaderValue(headerMap, ['tên hợp đồng']);
  const contractCode = findHeaderValue(headerMap, ['mã hđ', 'mã hđ', 'ma hđ']);
  const webType = findHeaderValue(headerMap, ['loại web', 'loai web']);

  const contextValues = {};
  for (const f of CUSTOMER_RAW_CONTEXT_FIELDS) {
    contextValues[f.field] = '';
  }
  if (contractCode) contextValues['Project ID'] = contractCode;
  if (customer) {
    contextValues.Customer = customer;
    contextValues['Project Name'] = customer;
  }
  if (webType) contextValues['Target Platform'] = webType;

  const features = [];
  let lastGroup = '';
  for (let i = headerRowIdx + 1; i < rows.length; i += 1) {
    const stt = cell(rows[i], 0);
    const group = cell(rows[i], 1);
    const name = cell(rows[i], 2);
    const desc = cell(rows[i], 3);
    const note = cell(rows[i], 5);
    if (group) lastGroup = group;
    if (!name && !desc) continue;
    // Skip numeric-looking continuation noise without a feature name
    if (!name) continue;
    features.push({
      stt,
      group: group || lastGroup,
      name,
      desc,
      note,
    });
  }

  const requirements = features.map((f, idx) => {
    const id = `CR-${String(idx + 1).padStart(3, '0')}`;
    const requirementText = f.desc ? `${f.name}. ${f.desc}` : f.name;
    return [
      id,
      '', // Request ID — blank (no invented BRQ)
      requirementText,
      'Functional',
      f.group || '',
      '', // User / Actor
      '', // Priority
      '', // Acceptance
      'Document',
      opts.fileName ? String(opts.fileName).slice(0, 200) : '',
      '', // Stakeholder — no PII from contact block
      '', // Date Raised
      f.note || '',
      '', // Attachment
    ];
  });

  const metaOverrides = {
    CustomerName: customer,
    ProjectName: customer || contractCode,
    CollectedBy: '',
    CollectedDate: '',
    Language: 'vi',
  };

  return {
    profile: 'neway_trang_chu',
    metaOverrides,
    contextValues,
    businessRequests: [],
    requirements,
    nfrs: [],
    references: [],
    counts: {
      requirements: requirements.length,
      businessRequests: 0,
      nfrs: 0,
      references: 0,
    },
  };
}

function emptyPayload() {
  const contextValues = {};
  for (const f of CUSTOMER_RAW_CONTEXT_FIELDS) {
    contextValues[f.field] = '';
  }
  return {
    profile: 'neway_trang_chu',
    metaOverrides: {},
    contextValues,
    businessRequests: [],
    requirements: [],
    nfrs: [],
    references: [],
    counts: { requirements: 0, businessRequests: 0, nfrs: 0, references: 0 },
  };
}

/**
 * Build a minimal in-memory Neway-like workbook buffer for tests.
 */
function buildSyntheticNewayBuffer({
  customer = 'CÔNG TY TNHH DEMO',
  contractCode = 'HĐ-001',
  features = [
    { stt: '1', group: '', name: 'VAI TRÒ', desc: 'Thêm vai trò, sửa, xoá' },
    { stt: '2', group: 'BÁO CÁO', name: 'BÁO CÁO', desc: 'Xuất Excel' },
  ],
} = {}) {
  const aoa = [
    ['', '', 'BẢNG MÔ TẢ CHI TIẾT DỰ ÁN LẬP TRÌNH'],
    [],
    [],
    ['TÊN HỢP ĐỒNG', '', '', '', customer],
    ['MÃ HĐ', '', '', '', contractCode],
    ['LINK DEMO', '', '', '', ''],
    ['LOẠI WEB', '', '', '', 'Responsive + SSL'],
    ['TRANG WEB TƯƠNG TỰ', '', '', '', ''],
    ['THÔNG TIN LIÊN HỆ', '', '', '', ''],
    ['TÊN QUẢN LÝ - EMAIL', '', '', '', 'Nguyễn A'],
    ['SỐ ĐIỆN THOẠI - ZALO', '', '', '', '0900000000'],
    [],
    [],
    [],
    [],
    [],
    [],
    ['STT', 'NHÓM CHỨC NĂNG', 'TÊN CHỨC NĂNG', 'MÔ TẢ CHI TIẾT CHỨC NĂNG', 'RESPONSIVE', 'GHI CHÚ'],
  ];
  for (const f of features) {
    aoa.push([f.stt || '', f.group || '', f.name || '', f.desc || '', '', f.note || '']);
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'TRANG CHỦ');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  mapNewayTrangChuToRawPayload,
  buildSyntheticNewayBuffer,
};
