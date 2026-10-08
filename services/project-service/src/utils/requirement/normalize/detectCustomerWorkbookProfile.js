/**
 * Detect supported customer workbook profiles for Chuẩn hóa dữ liệu → Customer Raw.
 * Deterministic heuristics only — no AI.
 */

const XLSX = require('xlsx');

const PROFILE_NEWAY_TRANG_CHU = 'neway_trang_chu';
const PROFILE_UNKNOWN = 'unknown';

function loadWorkbook(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) return null;
  try {
    return XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch {
    return null;
  }
}

function sheetMatrix(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) || [];
}

function normCell(v) {
  return String(v || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Neway-style: one sheet (often "TRANG CHỦ") with contract header block +
 * feature table headers STT | NHÓM CHỨC NĂNG | TÊN CHỨC NĂNG | MÔ TẢ…
 */
function looksLikeNewayTrangChu(workbook) {
  const names = workbook.SheetNames || [];
  if (!names.length) return false;

  for (const name of names) {
    const rows = sheetMatrix(workbook, name);
    if (rows.length < 10) continue;

    let hasContractHint = false;
    let featureHeaderRow = -1;

    for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
      const row = rows[i] || [];
      const joined = row.map(normCell).filter(Boolean).join(' | ');
      if (
        joined.includes('tên hợp đồng') ||
        joined.includes('mã hđ') ||
        joined.includes('mã hđ') ||
        joined.includes('bảng mô tả chi tiết')
      ) {
        hasContractHint = true;
      }

      const c0 = normCell(row[0]);
      const c1 = normCell(row[1]);
      const c2 = normCell(row[2]);
      const c3 = normCell(row[3]);
      const isStt = c0 === 'stt';
      const hasGroup = c1.includes('nhóm') || c1.includes('chức năng');
      const hasName = c2.includes('tên') && c2.includes('chức năng');
      const hasDesc = c3.includes('mô tả');
      if (isStt && (hasName || hasDesc) && (hasGroup || hasName)) {
        featureHeaderRow = i;
        break;
      }
    }

    if (hasContractHint && featureHeaderRow >= 0) {
      return { matched: true, sheetName: name, featureHeaderRow };
    }

    // Fallback: sheet named TRANG CHỦ + feature header
    if (normCell(name).includes('trang chủ') && featureHeaderRow >= 0) {
      return { matched: true, sheetName: name, featureHeaderRow };
    }
  }

  return { matched: false };
}

/**
 * @param {Buffer|Uint8Array} buffer
 * @returns {{ profile: string, sheetName?: string, featureHeaderRow?: number, workbook?: object }}
 */
function detectCustomerWorkbookProfile(buffer) {
  const workbook = loadWorkbook(buffer);
  if (!workbook) {
    return { profile: PROFILE_UNKNOWN };
  }

  const neway = looksLikeNewayTrangChu(workbook);
  if (neway.matched) {
    return {
      profile: PROFILE_NEWAY_TRANG_CHU,
      sheetName: neway.sheetName,
      featureHeaderRow: neway.featureHeaderRow,
      workbook,
    };
  }

  return { profile: PROFILE_UNKNOWN, workbook };
}

module.exports = {
  PROFILE_NEWAY_TRANG_CHU,
  PROFILE_UNKNOWN,
  detectCustomerWorkbookProfile,
  loadWorkbook,
  sheetMatrix,
  looksLikeNewayTrangChu,
};
