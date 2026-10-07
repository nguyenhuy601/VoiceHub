const { logger } = require('@enterprise/shared');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

/**
 * Header gọi organization-service: chỉ build từ req.user + GATEWAY_INTERNAL_TOKEN.
 * Không copy x-user-id / x-gateway-internal-token từ client khi thiếu token nội bộ.
 */
function headersForOrganizationForward(req) {
  const headers = {};
  const uid = String(req?.user?.id || req?.user?.userId || req?.user?._id || '').trim();
  const gwTok = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

  if (uid && gwTok) {
    Object.assign(headers, buildTrustedGatewayHeaders(uid));
  } else if (uid && !gwTok) {
    logger.warn('[chat] organization forward blocked — GATEWAY_INTERNAL_TOKEN missing', {
      hasUser: true,
    });
  }

  const auth = req?.headers?.authorization;
  if (auth) headers.Authorization = auth;
  return headers;
}

module.exports = { headersForOrganizationForward };
