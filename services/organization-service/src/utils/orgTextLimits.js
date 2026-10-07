const ORG_TEXT_LIMITS = Object.freeze({
  name: 120,
  description: 1000,
  code: 64,
  logo: 2048,
});

function badRequest(errorCode, message) {
  return Object.assign(new Error(message), { statusCode: 400, errorCode });
}

/** Bỏ qua field undefined/null; field khác chuỗi hoặc quá dài → 400 (RULE-14). */
function assertTextLimits(fields, limits = ORG_TEXT_LIMITS) {
  Object.entries(fields || {}).forEach(([field, value]) => {
    if (value === undefined || value === null) return;
    const max = limits[field];
    if (!max) return;
    if (typeof value !== 'string') {
      throw badRequest('ORG_VALIDATION_FAILED', `Trường ${field} không hợp lệ.`);
    }
    if (value.length > max) {
      throw badRequest('ORG_TEXT_TOO_LONG', `Trường ${field} tối đa ${max} ký tự.`);
    }
  });
}

function assertHttpUrl(value, field = 'logo') {
  if (value === undefined || value === null || value === '') return;
  assertTextLimits({ [field]: value });
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw badRequest('ORG_INVALID_URL', `Trường ${field} phải là URL http(s) hợp lệ.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw badRequest('ORG_INVALID_URL', `Trường ${field} phải là URL http(s) hợp lệ.`);
  }
}

module.exports = { ORG_TEXT_LIMITS, assertTextLimits, assertHttpUrl };
