/**
 * Validation ngày sinh khi đăng ký — tài khoản cũ có thể có dateOfBirth = null (không áp dụng hàm này).
 */
const MIN_AGE = 13;
const MAX_AGE = 120;

function startOfDay(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

/**
 * @param {unknown} value — chuỗi YYYY-MM-DD hoặc ISO từ client
 * @returns {{ ok: true, date: Date } | { ok: false, message: string }}
 */
function validateRegistrationDateOfBirth(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: false, message: 'Ngày sinh là bắt buộc' };
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, message: 'Ngày sinh không hợp lệ' };
  }

  const birth = startOfDay(d);
  const today = startOfDay(new Date());

  if (birth > today) {
    return { ok: false, message: 'Ngày sinh không được là ngày trong tương lai' };
  }

  const oldest = new Date(today);
  oldest.setFullYear(oldest.getFullYear() - MAX_AGE);
  if (birth < oldest) {
    return { ok: false, message: 'Ngày sinh không hợp lệ' };
  }

  const minBirth = new Date(today);
  minBirth.setFullYear(minBirth.getFullYear() - MIN_AGE);
  if (birth > minBirth) {
    return { ok: false, message: `Bạn phải đủ ${MIN_AGE} tuổi để đăng ký` };
  }

  return { ok: true, date: d };
}

module.exports = {
  validateRegistrationDateOfBirth,
  MIN_AGE,
  MAX_AGE,
};
