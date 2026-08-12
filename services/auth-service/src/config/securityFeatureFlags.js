/**
 * Phase 6 Wave C — security feature flags (read-only stubs).
 * Không thay đổi JWT / login / protect. Chỉ báo trạng thái cho ops & admin UI.
 */
function envFlag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue;
  const v = String(raw).trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return defaultValue;
}

const AUTH_MFA_ENABLED = envFlag('AUTH_MFA_ENABLED', false);
const AUTH_SSO_ENABLED = envFlag('AUTH_SSO_ENABLED', false);
const AUTH_IP_ALLOWLIST_ENABLED = envFlag('AUTH_IP_ALLOWLIST_ENABLED', false);
const AUTH_WEBAUTHN_ENABLED = envFlag('AUTH_WEBAUTHN_ENABLED', false);

function getSecurityFeatureFlags() {
  return {
    mfa: AUTH_MFA_ENABLED,
    sso: AUTH_SSO_ENABLED,
    ipAllowlist: AUTH_IP_ALLOWLIST_ENABLED,
    webauthn: AUTH_WEBAUTHN_ENABLED,
    wave: 'C',
    status: 'deferred',
    note: 'SSO/LDAP/AD/MFA/IP allowlist — plan riêng; không bật trong luồng auth hiện tại',
  };
}

module.exports = {
  AUTH_MFA_ENABLED,
  AUTH_SSO_ENABLED,
  AUTH_IP_ALLOWLIST_ENABLED,
  AUTH_WEBAUTHN_ENABLED,
  getSecurityFeatureFlags,
  envFlag,
};
