const crypto = require('crypto');
const UserAuth = require('../models/UserAuth');
const AuthLoginEvent = require('../models/AuthLoginEvent');
const emailService = require('../utils/email');
const { hashPassword, validatePasswordStrength } = require('../utils/password');
const { bumpTokenVersion } = require('../utils/tokenVersion');
const { findUserAuthByEmail, hydrateAuthEmailDoc, readEmailFromStored } = require('../utils/authEmailPii');

function createServiceError(message, statusCode = 400, errorCode = 'AUTH_VALIDATION') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

function normalizeUserId(value) {
  return String(value || '').trim();
}

async function findAuthByUserId(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return null;
  const { mongoose } = require('@enterprise/shared/config/mongo');
  const queries = [{ userId: uid }];
  if (mongoose.Types.ObjectId.isValid(uid)) {
    queries.push({ userId: new mongoose.Types.ObjectId(uid) });
  }
  for (const query of queries) {
    const row = await UserAuth.findOne(query);
    if (row) return row;
  }
  return null;
}

async function recordLoginEvent({ userId, success, ip, userAgent, errorCode }) {
  const uid = normalizeUserId(userId);
  if (!uid) return;
  try {
    await AuthLoginEvent.create({
      userId: uid,
      success: Boolean(success),
      ip: ip || null,
      userAgent: userAgent || null,
      errorCode: errorCode || null,
    });
  } catch {
    // non-blocking
  }
}

function buildAuthSummaryPayload(userAuth, email) {
  const lockUntil = userAuth.lockUntil || null;
  const isRateLocked = Boolean(lockUntil && lockUntil > new Date());
  return {
    userId: normalizeUserId(userAuth.userId),
    email,
    isActive: Boolean(userAuth.isActive),
    mustChangePassword: Boolean(userAuth.mustChangePassword),
    lastLoginAt: userAuth.lastLoginAt || null,
    isLocked: !userAuth.isActive || isRateLocked,
    isEmailVerified: Boolean(userAuth.isEmailVerified),
    pendingEmail: userAuth.pendingEmail || null,
    loginAttempts: Number(userAuth.loginAttempts || 0),
    lockUntil,
    systemRole: userAuth.systemRole || 'employee',
  };
}

async function getAuthSummary(userId) {
  const userAuth = await findAuthByUserId(userId);
  if (!userAuth) return null;
  const email = (await hydrateAuthEmailDoc(userAuth)) || readEmailFromStored(userAuth.email) || null;
  return buildAuthSummaryPayload(userAuth, email);
}

async function getAuthSummaryBatch(userIds) {
  const ids = [...new Set(userIds.map(normalizeUserId).filter(Boolean))];
  if (!ids.length) return [];
  const { mongoose } = require('@enterprise/shared/config/mongo');
  const idVariants = [...ids];
  for (const id of ids) {
    if (mongoose.Types.ObjectId.isValid(id)) {
      idVariants.push(new mongoose.Types.ObjectId(id));
    }
  }
  const rows = await UserAuth.find({ userId: { $in: idVariants } })
    .select(
      'userId email isActive mustChangePassword lastLoginAt lockUntil loginAttempts isEmailVerified pendingEmail systemRole'
    )
    .lean();
  return rows.map((row) =>
    buildAuthSummaryPayload(row, readEmailFromStored(row.email) || null)
  );
}

async function setUserLocked(userId, locked) {
  const userAuth = await findAuthByUserId(userId);
  if (!userAuth) {
    throw createServiceError('Không tìm thấy tài khoản.', 404, 'AUTH_USER_NOT_FOUND');
  }
  userAuth.isActive = !locked;
  if (locked) {
    userAuth.lockUntil = null;
    userAuth.loginAttempts = 0;
  }
  await userAuth.save();
  await bumpTokenVersion(userAuth);
  return getAuthSummary(userId);
}

async function setMustChangePassword(userId, mustChange) {
  const userAuth = await findAuthByUserId(userId);
  if (!userAuth) {
    throw createServiceError('Không tìm thấy tài khoản.', 404, 'AUTH_USER_NOT_FOUND');
  }
  userAuth.mustChangePassword = Boolean(mustChange);
  await userAuth.save();
  if (mustChange) {
    await bumpTokenVersion(userAuth);
  }
  return getAuthSummary(userId);
}

async function triggerPasswordReset(userId, frontendUrl) {
  const userAuth = await findAuthByUserId(userId);
  if (!userAuth) {
    throw createServiceError('Không tìm thấy tài khoản.', 404, 'AUTH_USER_NOT_FOUND');
  }
  const plainEmail = await hydrateAuthEmailDoc(userAuth);
  if (!plainEmail) {
    throw createServiceError('Tài khoản không có email.', 400, 'AUTH_EMAIL_MISSING');
  }

  const passwordResetToken = crypto.randomBytes(32).toString('hex');
  userAuth.passwordResetToken = passwordResetToken;
  userAuth.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await userAuth.save();

  let emailScheduled = false;
  if (emailService.isAvailable()) {
    const emailResult = await emailService.sendPasswordResetEmail(
      plainEmail,
      passwordResetToken,
      frontendUrl
    );
    emailScheduled = Boolean(emailResult);
  }

  return {
    emailScheduled,
    email: plainEmail,
    resetUrl:
      !emailScheduled && process.env.NODE_ENV !== 'production' && frontendUrl
        ? `${String(frontendUrl).replace(/\/+$/, '')}/reset-password#token=${encodeURIComponent(passwordResetToken)}`
        : null,
  };
}

async function revokeUserSessions(userId) {
  const userAuth = await findAuthByUserId(userId);
  if (!userAuth) {
    throw createServiceError('Không tìm thấy tài khoản.', 404, 'AUTH_USER_NOT_FOUND');
  }
  userAuth.refreshToken = null;
  userAuth.refreshTokenExpiresAt = null;
  await userAuth.save();
  await bumpTokenVersion(userAuth);
  return getAuthSummary(userId);
}

async function setPasswordByAdmin(userId, { password, mustChangePassword = false } = {}) {
  const userAuth = await findAuthByUserId(userId);
  if (!userAuth) {
    throw createServiceError('Không tìm thấy tài khoản.', 404, 'AUTH_USER_NOT_FOUND');
  }
  const plainPassword = String(password || '').trim();
  if (!plainPassword) {
    throw createServiceError('Mật khẩu không được để trống.', 400, 'AUTH_PASSWORD_REQUIRED');
  }
  const validation = validatePasswordStrength(plainPassword);
  if (!validation.isValid) {
    throw createServiceError(validation.errors[0] || 'Mật khẩu không hợp lệ.', 400, 'AUTH_PASSWORD_WEAK');
  }
  userAuth.password = await hashPassword(plainPassword);
  userAuth.mustChangePassword = Boolean(mustChangePassword);
  userAuth.passwordResetToken = null;
  userAuth.passwordResetExpiresAt = null;
  await userAuth.save();
  await bumpTokenVersion(userAuth);
  return getAuthSummary(userId);
}

async function resendVerificationByUserId(userId, frontendUrl) {
  const userAuth = await findAuthByUserId(userId);
  if (!userAuth) {
    throw createServiceError('Không tìm thấy tài khoản.', 404, 'AUTH_USER_NOT_FOUND');
  }
  if (userAuth.isEmailVerified) {
    return {
      message: 'Email is already verified',
      emailScheduled: false,
      alreadyVerified: true,
    };
  }

  const emailVerificationToken = crypto.randomBytes(32).toString('hex');
  userAuth.emailVerificationToken = emailVerificationToken;
  userAuth.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await userAuth.save();

  const plainEmail = await hydrateAuthEmailDoc(userAuth);
  if (!plainEmail) {
    throw createServiceError('Tài khoản không có email.', 400, 'AUTH_EMAIL_MISSING');
  }

  let emailScheduled = false;
  if (emailService.isAvailable()) {
    const emailResult = await emailService.sendVerificationEmail(
      plainEmail,
      emailVerificationToken,
      frontendUrl
    );
    emailScheduled = Boolean(emailResult);
  }

  const response = {
    message: 'Verification email sent if account exists',
    emailScheduled,
    email: plainEmail,
  };

  if (!emailScheduled && process.env.NODE_ENV !== 'production') {
    const baseNormalized = String(
      (frontendUrl && String(frontendUrl).trim()) ||
        process.env.FRONTEND_URL ||
        'http://localhost:5173'
    ).replace(/\/+$/, '');
    response.verificationUrl = `${baseNormalized}/verify-email#token=${encodeURIComponent(emailVerificationToken)}`;
  }

  return response;
}

async function listLoginEvents(userId, { limit = 50, page = 1 } = {}) {
  const uid = normalizeUserId(userId);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    AuthLoginEvent.find({ userId: uid }).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    AuthLoginEvent.countDocuments({ userId: uid }),
  ]);

  return {
    items: items.map((row) => ({
      id: String(row._id),
      userId: uid,
      success: Boolean(row.success),
      ip: row.ip || null,
      userAgent: row.userAgent || null,
      errorCode: row.errorCode || null,
      at: row.createdAt,
    })),
    total,
    page: safePage,
    limit: safeLimit,
  };
}

module.exports = {
  recordLoginEvent,
  getAuthSummary,
  getAuthSummaryBatch,
  setUserLocked,
  setMustChangePassword,
  triggerPasswordReset,
  revokeUserSessions,
  setPasswordByAdmin,
  resendVerificationByUserId,
  listLoginEvents,
};
