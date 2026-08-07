/**
 * Đồng bộ rule với services/auth-service/src/utils/password.js (validatePasswordStrength).
 */
const SPECIAL_RE = /[!@#$%^&*(),.?":{}|<>]/;

export function getPasswordPolicyIssues(password) {
  const p = String(password || '');
  const issues = [];
  if (p.length < 8) issues.push('min');
  if (!/[A-Z]/.test(p)) issues.push('upper');
  if (!/[a-z]/.test(p)) issues.push('lower');
  if (!/\d/.test(p)) issues.push('number');
  if (!SPECIAL_RE.test(p)) issues.push('special');
  return issues;
}

export function isPasswordPolicyOk(password) {
  return getPasswordPolicyIssues(password).length === 0;
}
