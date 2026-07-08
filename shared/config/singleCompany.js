/**
 * Single-company deploy flags — đọc từ env, dùng chéo gateway / org / auth.
 */
function envTruthy(name) {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function isSingleOrgMode() {
  return envTruthy('SINGLE_ORG_MODE');
}

function isPublicRegisterAllowed() {
  if (envTruthy('ALLOW_PUBLIC_REGISTER')) return true;
  if (String(process.env.ALLOW_PUBLIC_REGISTER || '').trim().toLowerCase() === 'false') {
    return false;
  }
  return !isSingleOrgMode();
}

function getInternalGatewayToken() {
  return String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
}

function isInternalSeedRequest(req) {
  const token = getInternalGatewayToken();
  if (!token) return false;
  const header = String(
    req.headers['x-internal-token'] ||
      req.headers['x-seed-token'] ||
      req.headers['x-gateway-internal-token'] ||
      ''
  ).trim();
  return header.length > 0 && header === token;
}

module.exports = {
  isSingleOrgMode,
  isPublicRegisterAllowed,
  getInternalGatewayToken,
  isInternalSeedRequest,
};
