const axios = require('axios');

const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
const USER_SERVICE_INTERNAL_TOKEN = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();

function internalHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-internal-token': USER_SERVICE_INTERNAL_TOKEN,
  };
}

/**
 * Precheck: employeeCode nào đã tồn tại trên user-service (uppercase).
 * @param {string[]} codes
 * @returns {Promise<string[]>}
 */
async function findTakenEmployeeCodes(codes) {
  if (!USER_SERVICE_URL || !USER_SERVICE_INTERNAL_TOKEN) {
    throw new Error('USER_SERVICE_URL or USER_SERVICE_INTERNAL_TOKEN not configured');
  }

  const list = Array.isArray(codes) ? codes.filter(Boolean) : [];
  if (!list.length) return [];

  const response = await axios.post(
    `${USER_SERVICE_URL}/api/users/internal/employee-codes/taken`,
    { codes: list },
    {
      headers: internalHeaders(),
      timeout: Number(process.env.USER_PROFILE_BULK_IMPORT_TIMEOUT_MS || 15000),
      validateStatus: () => true,
    }
  );

  if (response.status >= 400) {
    const msg = response.data?.message || 'employeeCode lookup failed';
    const err = new Error(msg);
    err.statusCode = response.status;
    err.errorCode = response.data?.errorCode || 'EMPLOYEE_CODE_LOOKUP_FAILED';
    throw err;
  }

  const taken = response.data?.data?.taken ?? response.data?.taken ?? [];
  return Array.isArray(taken) ? taken.map((c) => String(c).trim().toUpperCase()) : [];
}

/**
 * Max seq đã dùng trên profile (VD VH-001 → 1). Lỗi mạng → 0 (fallback invite-only).
 * @param {string} [prefix]
 * @returns {Promise<number>}
 */
async function fetchMaxEmployeeCodeSeq(prefix = 'VH-') {
  if (!USER_SERVICE_URL || !USER_SERVICE_INTERNAL_TOKEN) {
    return 0;
  }
  try {
    const response = await axios.post(
      `${USER_SERVICE_URL}/api/users/internal/employee-codes/max-seq`,
      { prefix: String(prefix || 'VH-').toUpperCase() },
      {
        headers: internalHeaders(),
        timeout: Number(process.env.USER_PROFILE_BULK_IMPORT_TIMEOUT_MS || 15000),
        validateStatus: () => true,
      }
    );
    if (response.status >= 400) return 0;
    const n = Number(response.data?.data?.maxSeq ?? response.data?.maxSeq ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

module.exports = {
  findTakenEmployeeCodes,
  fetchMaxEmployeeCodeSeq,
};
