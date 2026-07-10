const crypto = require('crypto');
const UserAuth = require('../models/UserAuth');
const AuthLoginEvent = require('../models/AuthLoginEvent');
const emailService = require('../utils/email');
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

async function getAuthSummary(userId) {
  const userAuth = await findAuthByUserId(userId);
  if (!userAuth) return null;
  const email = (await hydrateAuthEmailDoc(userAuth)) || readEmailFromStored(userAuth.email) || null;
  return {
    userId: normalizeUserId(userAuth.userId),
    email,
    isActive: Boolean(userAuth.isActive),
    mustChangePassword: Boolean(userAuth.mustChangePassword),
    lastLoginAt: userAuth.lastLoginAt || null,
    isLocked: Boolean(userAuth.isLocked),
    systemRole: userAuth.systemRole || 'employee',
  };
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
    .select('userId email isActive mustChangePassword lastLoginAt lockUntil systemRole')
    .lean();
  return rows.map((row) => ({
    userId: normalizeUserId(row.userId),
    email: readEmailFromStored(row.email) || null,
    isActive: Boolean(row.isActive),
    mustChangePassword: Boolean(row.mustChangePassword),
    lastLoginAt: row.lastLoginAt || null,
    isLocked: Boolean(row.lockUntil && row.lockUntil > new Date()),
    systemRole: row.systemRole || 'employee',
  }));
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
  listLoginEvents,
};
