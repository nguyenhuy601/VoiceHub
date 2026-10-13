function resolveDenyUnmapped(env = process.env) {
  const isProd = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  // Prod: không cho tắt (tránh lộ route quên map permission).
  if (isProd) return true;
  return String(env.PERMISSION_DENY_UNMAPPED || 'true').trim() !== 'false';
}

module.exports = { resolveDenyUnmapped };
