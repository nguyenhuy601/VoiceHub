/** Tối đa 5 DA quá khứ trên 1 hàng Excel — HR chọn theo JD, máy không chọn hộ. */
const PAST_PROJECT_MAX = 5;
const PAST_PROJECT_WORK_MAX = 300;
const PAST_PROJECT_YEAR_MIN = 1970;
const PAST_PROJECT_YEAR_MAX = 2100;

function cellStr(row, key) {
  const v = row?.[key];
  if (v == null) return '';
  return String(v).trim();
}

/**
 * Gom pastProject1..5* từ object hàng Excel.
 * Block hoàn toàn trống → bỏ. Block dở (có 1 ô) vẫn trả về để validator báo lỗi.
 */
function parsePastProjectBlocks(row = {}) {
  const out = [];
  for (let n = 1; n <= PAST_PROJECT_MAX; n += 1) {
    const name = cellStr(row, `pastProject${n}Name`);
    const role = cellStr(row, `pastProject${n}Role`);
    const work = cellStr(row, `pastProject${n}Work`);
    const yearRaw = cellStr(row, `pastProject${n}Year`);
    if (!name && !role && !work && !yearRaw) continue;
    out.push({ index: n, name, role, work, yearRaw });
  }
  return out;
}

function validatePastProjectBlock(block) {
  const idx = Number(block?.index) || 0;
  const name = String(block?.name || '').trim();
  const role = String(block?.role || '').trim();
  const work = String(block?.work || '').trim();
  const yearRaw = String(block?.yearRaw ?? '').trim();
  if (!name || !role || !work) {
    return {
      ok: false,
      message: `pastProject${idx}: cần đủ tên, vai trò và việc đã xử lý (hoặc để trống cả block).`,
      errorCode: 'VALIDATION_PAST_PROJECT_INCOMPLETE',
    };
  }
  if (work.length > PAST_PROJECT_WORK_MAX) {
    return {
      ok: false,
      message: `pastProject${idx}: mô tả việc tối đa ${PAST_PROJECT_WORK_MAX} ký tự.`,
      errorCode: 'VALIDATION_PAST_PROJECT_WORK_LENGTH',
    };
  }
  let year;
  if (yearRaw) {
    const y = Number(yearRaw);
    if (!Number.isFinite(y) || y < PAST_PROJECT_YEAR_MIN || y > PAST_PROJECT_YEAR_MAX) {
      return {
        ok: false,
        message: `pastProject${idx}: năm phải từ ${PAST_PROJECT_YEAR_MIN}–${PAST_PROJECT_YEAR_MAX}.`,
        errorCode: 'VALIDATION_PAST_PROJECT_YEAR',
      };
    }
    year = Math.floor(y);
  }
  return {
    ok: true,
    value: {
      name,
      role,
      work,
      ...(year != null ? { year } : {}),
    },
  };
}

module.exports = {
  PAST_PROJECT_MAX,
  PAST_PROJECT_WORK_MAX,
  parsePastProjectBlocks,
  validatePastProjectBlock,
};
