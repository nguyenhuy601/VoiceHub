function authEmailFromReq(req) {
  if (!req) return '';
  return String(req.headers?.['x-user-email'] || req.user?.email || '')
    .trim()
    .toLowerCase();
}

/**
 * Điền email khi profile trống.
 * Chỉ dùng email caller (x-user-email) khi allowCallerEmail — hồ sơ của chính mình.
 * authSummary phải là { email } của user đích, không phải userId string.
 */
function withAuthEmailFallback(req, payload, authSummary = null, options = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  if (String(payload.email || '').trim()) return payload;

  const fromTargetAuth = String(authSummary?.email || '').trim();
  if (fromTargetAuth) return { ...payload, email: fromTargetAuth };

  if (options.allowCallerEmail) {
    const callerEmail = authEmailFromReq(req);
    if (callerEmail) return { ...payload, email: callerEmail };
  }
  return payload;
}

module.exports = {
  authEmailFromReq,
  withAuthEmailFallback,
};
