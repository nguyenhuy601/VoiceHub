/**
 * Email domain allowlist cho invite / Excel import.
 * - allowedDomains rỗng → không chặn (UAT/dev).
 * - Có list → email phải thuộc một trong các domain (lowercase, không có @).
 */

function normalizeDomainList(raw) {
  if (!Array.isArray(raw)) {
    if (typeof raw === 'string') {
      return String(raw)
        .split(/[,;\s]+/)
        .map((d) => String(d || '').trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean);
    }
    return [];
  }
  return raw
    .map((d) => String(d || '').trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

function extractEmailDomain(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1 || at === e.length - 1) return '';
  return e.slice(at + 1);
}

/**
 * @param {string} email
 * @param {string[]|string|null|undefined} allowedDomains
 * @returns {{ ok: true } | { ok: false, message: string, errorCode: string }}
 */
function assertEmailDomainAllowed(email, allowedDomains) {
  const list = normalizeDomainList(allowedDomains);
  if (!list.length) return { ok: true };

  const domain = extractEmailDomain(email);
  if (!domain) {
    return {
      ok: false,
      message: 'Email không hợp lệ',
      errorCode: 'VALIDATION_EMAIL_INVALID',
    };
  }
  if (!list.includes(domain)) {
    return {
      ok: false,
      message: `Domain email không được phép: @${domain}. Cho phép: ${list.map((d) => `@${d}`).join(', ')}`,
      errorCode: 'VALIDATION_EMAIL_DOMAIN',
    };
  }
  return { ok: true };
}

/**
 * Resolve list từ Organization.settings + env fallback.
 * ORG_ALLOWED_EMAIL_DOMAINS=gmail.com,voicehub.local,voicehub.net
 */
function resolveAllowedEmailDomains(organization) {
  const fromOrg = organization?.settings?.allowedEmailDomains;
  const orgList = normalizeDomainList(fromOrg);
  if (orgList.length) return orgList;
  return normalizeDomainList(process.env.ORG_ALLOWED_EMAIL_DOMAINS || '');
}

module.exports = {
  normalizeDomainList,
  extractEmailDomain,
  assertEmailDomainAllowed,
  resolveAllowedEmailDomains,
};
