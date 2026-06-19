/** Demo accounts — parity Figma LoginPage (DEV one-click login). */

/** Mật khẩu chung demo — đủ rule auth-service (8+ ký tự, hoa/thường/số/ký tự đặc biệt). */
export const DEMO_ACCOUNT_PASSWORD = 'Password1!';

/**
 * Bật panel demo + UI role overlay khi DEV.
 * Tắt: VITE_ENABLE_DEMO_ACCOUNTS=false trong client/.env
 */
export function isDemoAccountsEnabled() {
  if (!import.meta.env.DEV) return false;
  const flag = String(import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS ?? 'true')
    .trim()
    .toLowerCase();
  return flag !== 'false' && flag !== '0' && flag !== 'off';
}

export const DEMO_ACCOUNTS = [
  {
    email: 'admin@voicehub.io',
    name: 'Admin VoiceHub',
    role: 'admin',
    roleLabel: 'Quản trị hệ thống',
    color: '#EF4444',
    desc: 'Toàn quyền hệ thống',
  },
  {
    email: 'owner@voicehub.io',
    name: 'Đỗ Công Danh',
    role: 'owner',
    roleLabel: 'Chủ sở hữu',
    color: '#F59E0B',
    desc: 'CEO · VoiceCorp',
  },
  {
    email: 'manager@voicehub.io',
    name: 'Nguyễn Huỳnh Nhật Huy',
    role: 'manager',
    roleLabel: 'Quản lý',
    color: '#8B5CF6',
    desc: 'Giám đốc điều hành',
  },
  {
    email: 'member@voicehub.io',
    name: 'Lê Anh Tuấn',
    role: 'member',
    roleLabel: 'Thành viên',
    color: '#10B981',
    desc: 'Trưởng dự án',
  },
  {
    email: 'personal@voicehub.io',
    name: 'Phạm Thị Bảo Châu',
    role: 'personal',
    roleLabel: 'Cá nhân',
    color: '#2563EB',
    desc: 'Không thuộc tổ chức',
  },
  {
    email: 'guest@voicehub.io',
    name: 'Đối tác FPT',
    role: 'guest',
    roleLabel: 'Khách',
    color: '#9CA3AF',
    desc: 'Quyền hạn chế',
  },
];

export const DEMO_EMAIL_ROLES = Object.fromEntries(
  DEMO_ACCOUNTS.map((a) => [a.email.toLowerCase(), a.role])
);

export function isDemoAccountEmail(email) {
  return Boolean(DEMO_EMAIL_ROLES[String(email || '').toLowerCase()]);
}
