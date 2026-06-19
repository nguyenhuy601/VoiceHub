import authService from '../services/authService';
import {
  DEMO_ACCOUNT_PASSWORD,
  DEMO_ACCOUNTS,
  isDemoAccountEmail,
  isDemoAccountsEnabled,
} from '../config/demoAccounts';
import { extractApiErrorMeta } from './resolveApiErrorMessage';

function parseDemoName(acc) {
  const parts = String(acc?.name || 'Demo User')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] || 'Demo', lastName: 'User' };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * DEV: đảm bảo tài khoản demo tồn tại trước khi gọi AuthContext.login.
 * Xác thực email do auth-service dev bypass (không phụ thuộc SMTP).
 */
export async function ensureDemoAccountProvisioned(email) {
  if (!isDemoAccountsEnabled() || !isDemoAccountEmail(email)) return;

  const acc = DEMO_ACCOUNTS.find(
    (a) => a.email.toLowerCase() === String(email || '').toLowerCase()
  );
  if (!acc) return;

  try {
    await authService.login(email, DEMO_ACCOUNT_PASSWORD);
    return;
  } catch (err) {
    const code = extractApiErrorMeta(err).errorCode;
    if (code !== 'AUTH_INVALID_CREDENTIALS') {
      throw err;
    }
  }

  const { firstName, lastName } = parseDemoName(acc);
  try {
    await authService.register({
      email: acc.email,
      password: DEMO_ACCOUNT_PASSWORD,
      firstName,
      lastName,
      dateOfBirth: '1990-01-01',
    });
  } catch (err) {
    const code = extractApiErrorMeta(err).errorCode;
    if (code !== 'AUTH_EMAIL_EXISTS') {
      throw err;
    }
  }
}
