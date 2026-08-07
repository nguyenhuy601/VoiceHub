/**
 * Gate Swagger UI / OpenAPI.
 * - Default: tắt khi NODE_ENV=production
 * - Override LAN/staging: SWAGGER_ALLOW_IN_PRODUCTION=1 (không bật trên internet prod thật)
 * - Non-prod: bật mặc định; tắt bằng SWAGGER_ENABLED=0|false|off
 */

function envFlagOn(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function envFlagOff(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'off' || v === 'no';
}

function isSwaggerEnabled(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || 'development').trim().toLowerCase();
  const allowInProd = envFlagOn(env.SWAGGER_ALLOW_IN_PRODUCTION);
  if (nodeEnv === 'production' && !allowInProd) return false;

  // Default on when enabled path reached
  if (env.SWAGGER_ENABLED === undefined || env.SWAGGER_ENABLED === '') return true;
  return !envFlagOff(env.SWAGGER_ENABLED);
}

/** Live rebuild từ monorepo — chỉ local; Swarm dùng openapi.bundle.json. */
function isSwaggerLiveScanEnabled(env = process.env) {
  if (!isSwaggerEnabled(env)) return false;
  return envFlagOn(env.SWAGGER_LIVE_SCAN);
}

module.exports = {
  isSwaggerEnabled,
  isSwaggerLiveScanEnabled,
};
