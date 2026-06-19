/**
 * DEV-only: one-click demo login (@voicehub.io) — không đổi luồng production.
 * Khớp danh sách client/src/config/demoAccounts.js
 */
const { mongoose } = require('@enterprise/shared/config/mongo');
const { comparePassword } = require('./password');
const { bootstrapUserProfile } = require('./bootstrapUserProfile');
const { normalizeEmail } = require('./authEmailPii');

const DEV_DEMO_EMAILS = new Set([
  'admin@voicehub.io',
  'owner@voicehub.io',
  'manager@voicehub.io',
  'member@voicehub.io',
  'personal@voicehub.io',
  'guest@voicehub.io',
]);

function isDevDemoBypassEnabled() {
  if (process.env.NODE_ENV === 'production') return false;
  const flag = String(process.env.AUTH_DEV_DEMO_BYPASS || 'true').trim().toLowerCase();
  return flag !== 'false' && flag !== '0' && flag !== 'off';
}

function isDevDemoEmail(email) {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && DEV_DEMO_EMAILS.has(normalized));
}

async function activateDevDemoAccount(userAuth) {
  if (!userAuth || userAuth.isEmailVerified) return false;

  let userId = userAuth.userId;
  if (!userId) {
    userId = new mongoose.Types.ObjectId();
    userAuth.userId = userId;
  }

  userAuth.isEmailVerified = true;
  userAuth.isActive = true;
  userAuth.emailVerificationToken = null;
  userAuth.emailVerificationExpiresAt = null;
  await userAuth.save();

  const bootstrap = await bootstrapUserProfile(userAuth, userId);
  if (!bootstrap.ok) {
    console.warn(
      '[AuthService] devDemo: UserProfile bootstrap chưa thành công — user có thể đăng nhập lại để thử.',
      bootstrap.reason
    );
  }

  console.log('[AuthService] devDemo: auto-activated demo account:', userAuth.userId);
  return true;
}

/**
 * Kích hoạt tài khoản demo khi mật khẩu đúng (chỉ non-production).
 */
async function tryActivateDevDemoAccount(userAuth, password, plainEmail) {
  if (!isDevDemoBypassEnabled() || !isDevDemoEmail(plainEmail)) return false;
  if (userAuth.isEmailVerified && userAuth.isActive) return false;

  const isPasswordValid = await comparePassword(password, userAuth.password);
  if (!isPasswordValid) return false;

  return activateDevDemoAccount(userAuth);
}

module.exports = {
  isDevDemoBypassEnabled,
  isDevDemoEmail,
  activateDevDemoAccount,
  tryActivateDevDemoAccount,
};
