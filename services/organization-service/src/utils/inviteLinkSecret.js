/**
 * Secret ký link mời tổ chức — bắt buộc tách khỏi JWT_SECRET.
 * Thiếu hoặc trùng JWT_SECRET → '' (fail closed): lộ JWT_SECRET không được phép giả link mời.
 */
function resolveInviteLinkSecret(env = process.env) {
  const secret = String(env.INVITE_LINK_SECRET || '').trim();
  if (!secret) return '';
  const jwtSecret = String(env.JWT_SECRET || '').trim();
  if (jwtSecret && secret === jwtSecret) return '';
  return secret;
}

module.exports = { resolveInviteLinkSecret };
