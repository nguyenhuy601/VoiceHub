const UserAuth = require('../models/UserAuth');
const axios = require('axios');
const { validateRegistrationDateOfBirth } = require('../utils/dateOfBirth');
const {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  generateTemporaryPassword,
} = require('../utils/password');
const { generateAccessToken, generateOpaqueRefreshToken } = require('../config/jwt');
const { bumpTokenVersion, accessTokenPayload } = require('../utils/tokenVersion');
const { cacheTokenVersion } = require('@enterprise/shared/utils/tokenVersionAuth');
const { hashRefreshToken, refreshTokenMatches } = require('../utils/refreshTokenHash');
const {
  refreshTokenExpiresAtFromNow,
  refreshTokenRedisTtlSeconds,
} = require('../utils/jwtDuration');
const { getRedisClient, logger } = require('@enterprise/shared');
const emailService = require('../utils/email');
const { bootstrapUserProfile } = require('../utils/bootstrapUserProfile');
const { writeDateOfBirthFields } = require('@enterprise/shared/utils/dateOfBirthPii');
const crypto = require('crypto');
const { mongoose } = require('@enterprise/shared/config/mongo');
const { hashOneTimeToken, oneTimeTokenQuery, readTokenInput } = require('../utils/oneTimeToken');
const { maskEmailForLog } = require('../utils/authInputSafety');
const {
  findUserAuthByEmail,
  hydrateAuthEmailDoc,
  writeEmailFields,
  normalizeEmail,
} = require('../utils/authEmailPii');

function createServiceError(message, statusCode = 400, errorCode = 'AUTH_VALIDATION') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}
const MAX_LOGIN_PASSWORD_LENGTH = 256;
const FORGOT_PASSWORD_MESSAGE = 'Nếu email tồn tại, liên kết đặt lại mật khẩu đã được gửi.';
const RESEND_VERIFICATION_MESSAGE = 'Nếu email tồn tại và chưa xác thực, liên kết xác thực đã được gửi.';

function invalidCredentialsError() {
  return createServiceError('Email hoặc mật khẩu không đúng', 401, 'AUTH_INVALID_CREDENTIALS');
}

let dummyHashPromise = null;
/** Hash giả sinh lười — không hardcode, không tốn bcrypt lúc khởi động. */
function getDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(crypto.randomBytes(24).toString('hex')).catch((err) => {
      dummyHashPromise = null;
      throw err;
    });
  }
  return dummyHashPromise;
}

async function ensureMongoReady(scope = 'AUTH') {
  const readyState = mongoose.connection.readyState;
  console.log(
    `[AuthService] [${scope}] MongoDB readyState:`,
    readyState,
    '(1=connected, 2=connecting, 0=disconnected)'
  );
  if (readyState === 1) return;
  // Không reconnect trong request để tránh reset connection pool cạnh tranh với background reconnect.
  throw createServiceError('Hệ thống đang bận. Vui lòng thử lại sau.', 503, 'AUTH_DB_UNAVAILABLE');
}

async function syncUserProfileEmail(userId, email) {
  const internalToken = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
  const userServiceUrl = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
  if (!internalToken || !userServiceUrl || !userId || !email) return;
  await axios.patch(
    `${userServiceUrl}/api/users/internal/email`,
    { userId: String(userId), email: String(email).trim().toLowerCase() },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': internalToken,
      },
      timeout: Number(process.env.USER_BOOTSTRAP_TIMEOUT_MS || 15000),
    }
  );
}

class AuthService {
  normalizeSystemRole(role) {
    const raw = String(role || '').trim().toLowerCase();
    return raw === 'admin' ? 'admin' : 'employee';
  }

  /** Cấp access + refresh token mới (login, đổi mật khẩu). Bump tv — vô hiệu session/tab cũ. */
  async issueSessionTokens(userAuth, plainEmail) {
    await bumpTokenVersion(userAuth);
    const payload = accessTokenPayload(userAuth, plainEmail);
    await cacheTokenVersion(userAuth.userId, payload.tv);

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateOpaqueRefreshToken();

    userAuth.refreshToken = hashRefreshToken(refreshToken);
    userAuth.refreshTokenExpiresAt = refreshTokenExpiresAtFromNow();
    await userAuth.save();

    const redis = getRedisClient();
    if (redis && userAuth.userId) {
      await redis.setex(
        `refresh_token:${userAuth.userId}`,
        refreshTokenRedisTtlSeconds(),
        hashRefreshToken(refreshToken)
      );
    }

    return {
      accessToken,
      refreshToken,
      user: {
        id: userAuth.userId,
        email: plainEmail,
        systemRole: this.normalizeSystemRole(userAuth.systemRole),
        mustChangePassword: Boolean(userAuth.mustChangePassword),
      },
    };
  }

  /** Rotate refresh token — không bump tv. */
  async rotateRefreshTokens(userAuth, plainEmail) {
    const payload = accessTokenPayload(userAuth, plainEmail);
    await cacheTokenVersion(userAuth.userId, payload.tv);

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateOpaqueRefreshToken();

    userAuth.refreshToken = hashRefreshToken(refreshToken);
    userAuth.refreshTokenExpiresAt = refreshTokenExpiresAtFromNow();
    await userAuth.save();

    const redis = getRedisClient();
    if (redis && userAuth.userId) {
      await redis.setex(
        `refresh_token:${userAuth.userId}`,
        refreshTokenRedisTtlSeconds(),
        hashRefreshToken(refreshToken)
      );
    }

    return { accessToken, refreshToken };
  }

  // Đăng ký user mới
  async register(userData, frontendUrl) {
    // Policy: tài khoản chỉ được cấp bởi admin hệ thống (internal provision).
    // Không cho self-register trong mọi môi trường.
    throw createServiceError(
      'Đăng ký công khai đã tắt. Liên hệ quản trị hệ thống để cấp tài khoản.',
      403,
      'AUTH_REGISTER_DISABLED'
    );
    /*
     * Giữ lại implementation cũ phía dưới để dễ rollback nếu policy thay đổi trong tương lai.
     * eslint-disable-next-line no-unreachable
     */
    try {
      const { email, password, firstName, lastName, dateOfBirth } = userData;
      const normalizedEmail = normalizeEmail(email);

      // Validate required fields
      if (!normalizedEmail || !password) {
        throw createServiceError('Email và mật khẩu là bắt buộc.', 400, 'VALIDATION_REQUIRED');
      }

      if (!firstName || !lastName) {
        throw createServiceError('Họ và tên là bắt buộc.', 400, 'VALIDATION_REQUIRED');
      }

      const dobCheck = validateRegistrationDateOfBirth(dateOfBirth);
      if (!dobCheck.ok) {
        throw createServiceError(dobCheck.message, 400, 'AUTH_VALIDATION');
      }

      // Kiểm tra trạng thái kết nối theo fail-fast, không reconnect trong request.
      await ensureMongoReady('REGISTER');

      // Kiểm tra email đã tồn tại chưa
      console.log('[AuthService] Checking if email exists:', maskEmailForLog(normalizedEmail));
      try {
        const existingUser = await findUserAuthByEmail(normalizedEmail, {
          maxTimeMS: 15000,
          lean: true,
        });
        
        if (existingUser) {
          console.log('[AuthService] Email already exists');
          throw createServiceError('Email đã được sử dụng', 400, 'AUTH_EMAIL_EXISTS');
        }
        console.log('[AuthService] ✅ Email is available');
      } catch (error) {
        if (error.errorCode === 'AUTH_EMAIL_EXISTS') {
          throw error;
        }
        console.error('[AuthService] ❌ Error checking email:', error.message);
        console.error('[AuthService] Error code:', error.code);
        console.error('[AuthService] Error name:', error.name);
        
        // Nếu là connection error, throw với message rõ ràng hơn
        if (error.name === 'MongoServerError' || error.message.includes('buffering') || error.message.includes('timeout')) {
          throw createServiceError('Hệ thống đang bận. Vui lòng thử lại sau.', 503, 'AUTH_DB_UNAVAILABLE');
        }
        throw createServiceError('Không thể xử lý đăng ký lúc này. Vui lòng thử lại.', 500, 'AUTH_INTERNAL_ERROR');
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        throw createServiceError(
          passwordValidation.errors.join(', '),
          400,
          passwordValidation.errorCode
        );
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Tạo email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Tạo user auth (chưa có userId, chưa active)
      // userId sẽ được tạo sau khi verify email thành công
      const userAuth = new UserAuth({
        ...writeEmailFields(normalizedEmail),
        ...writeDateOfBirthFields(dobCheck.date),
        password: hashedPassword,
        firstName,
        lastName,
        systemRole: 'employee',
        emailVerificationToken: hashOneTimeToken(emailVerificationToken),
        emailVerificationExpiresAt,
        isEmailVerified: false,
        isActive: false, // Chỉ active sau khi verify email
      });

      await userAuth.save();

      // Gửi email verification trong background (không block response)
      // Để tránh timeout, không await email sending
      console.log('[AuthService] 🔍 Checking email service availability...');
      console.log('[AuthService] emailService.isAvailable():', emailService.isAvailable());
      console.log('[AuthService] EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
      console.log('[AuthService] EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET');
      
      if (emailService.isAvailable()) {
        console.log('[AuthService] 📧 Email service is available, scheduling verification email to:', maskEmailForLog(normalizedEmail));
        console.log('[AuthService] Verification token: REDACTED');
        console.log('[AuthService] Email will be sent in background to avoid timeout');
        
        // Gửi email trong background - không await
        const emailPromise = emailService.sendVerificationEmail(
          normalizedEmail,
          emailVerificationToken,
          frontendUrl
        );
        console.log('[AuthService] Email promise created, waiting for result...');
        
        emailPromise
          .then((result) => {
            console.log('[AuthService] 📬 Email promise resolved');
            console.log('[AuthService] Result:', result ? 'Has result' : 'Null result');
            if (result && result.messageId) {
              console.log('[AuthService] ✅ Verification email sent successfully to:', maskEmailForLog(normalizedEmail));
              console.log('[AuthService] Email messageId:', result.messageId);
            } else {
              console.warn('[AuthService] ❌ Email service returned null');
              console.warn('[AuthService] Check email service configuration and logs above');
            }
          })
          .catch((error) => {
            console.error('[AuthService] ❌ Email promise rejected (error occurred)');
            console.error('[AuthService] Error code:', error?.code, error?.responseCode);
            
            // Nếu là lỗi authentication
            if (error.code === 'EAUTH' || error.responseCode === 535) {
              console.error('[AuthService] ⚠️ Gmail authentication failed!');
              console.error('[AuthService] Please check:');
              console.error('[AuthService] 1. EMAIL_USER is correct');
              console.error('[AuthService] 2. EMAIL_PASSWORD is an App Password (not regular password)');
              console.error('[AuthService] 3. 2-Step Verification is enabled');
            }
          });
        
        console.log('[AuthService] Email sending initiated, continuing with registration response...');
      } else {
        console.warn('[AuthService] ⚠️ Email service NOT available, skipping email send');
        console.warn('[AuthService] EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
        console.warn('[AuthService] EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET');
        console.warn('[AuthService] transporter:', emailService.transporter ? 'EXISTS' : 'NULL');
      }

      return {
        userAuth,
        emailVerificationToken: emailService.isAvailable() ? undefined : emailVerificationToken, // Chỉ trả về token nếu không gửi email
        emailScheduled: emailService.isAvailable(), // Email đã được lên lịch gửi (không chờ kết quả)
      };
    } catch (error) {
      throw error;
    }
  }

  // Đăng nhập
  async login(email, password) {
    try {
      // Kiểm tra trạng thái kết nối theo fail-fast, không reconnect trong request.
      if (typeof password !== 'string' || !password || password.length > MAX_LOGIN_PASSWORD_LENGTH) {
        throw invalidCredentialsError();
      }

      await ensureMongoReady('LOGIN');

      const userAuth =
        typeof email === 'string' ? await findUserAuthByEmail(email, { maxTimeMS: 15000 }) : null;

      if (!userAuth) {
        // bcrypt giả để email lạ tốn thời gian như email có thật (chống dò qua thời gian phản hồi).
        await comparePassword(password, await getDummyHash());
        throw invalidCredentialsError();
      }

      // Giữ trước kiểm mật khẩu để lockout còn tác dụng (đánh đổi: tài khoản đang khóa vẫn dò được).
      if (userAuth.isLocked) {
        throw createServiceError('Tài khoản tạm khóa do đăng nhập sai nhiều lần', 401, 'AUTH_ACCOUNT_LOCKED');
      }

      const isPasswordValid = await comparePassword(password, userAuth.password);
      if (!isPasswordValid) {
        await userAuth.incLoginAttempts();
        const err = invalidCredentialsError();
        Object.defineProperty(err, 'attemptedUserId', {
          value: userAuth.userId ? String(userAuth.userId) : null,
          enumerable: false,
        });
        throw err;
      }

      // Excel/HR pending: chưa đặt mk qua mail / chưa admin activate
      if (!userAuth.isEmailVerified && !userAuth.isActive) {
        throw createServiceError(
          'Tài khoản đang chờ kích hoạt. Kiểm tra email đặt mật khẩu hoặc liên hệ admin.',
          401,
          'AUTH_PENDING_ACTIVATION'
        );
      }

      // Kiểm tra email đã được verify chưa
      if (!userAuth.isEmailVerified) {
        throw createServiceError('Vui lòng xác thực email trước khi đăng nhập', 401, 'AUTH_EMAIL_NOT_VERIFIED');
      }

      // Kiểm tra account có active không
      if (!userAuth.isActive) {
        throw createServiceError('Tài khoản chưa kích hoạt.', 401, 'AUTH_ACCOUNT_INACTIVE');
      }

      const plainEmail = await hydrateAuthEmailDoc(userAuth);

      // Reset login attempts
      await userAuth.resetLoginAttempts();

      // Cập nhật lastLoginAt
      userAuth.lastLoginAt = new Date();
      await userAuth.save();

      // Đảm bảo UserProfile tồn tại (phòng bootstrap verify email lỗi trước đó)
      void bootstrapUserProfile(userAuth, userAuth.userId);

      return await this.issueSessionTokens(userAuth, plainEmail);
    } catch (error) {
      throw error;
    }
  }

  // Refresh access token (+ rotate refresh token)
  async refreshToken(refreshTokenRaw) {
    try {
      const raw = String(refreshTokenRaw || '').trim();
      if (!raw) {
        throw createServiceError('Phiên đăng nhập không hợp lệ hoặc đã hết hạn', 401, 'AUTH_REFRESH_INVALID');
      }

      const hashed = hashRefreshToken(raw);
      // Ưu tiên lookup theo hash đã lưu, fallback legacy plaintext nếu có dữ liệu cũ.
      let userAuth = await UserAuth.findOne({ refreshToken: hashed }).maxTimeMS(5000);
      if (!userAuth) {
        userAuth = await UserAuth.findOne({ refreshToken: raw }).maxTimeMS(5000);
      }

      if (!userAuth || userAuth.refreshTokenExpiresAt < new Date()) {
        throw createServiceError('Phiên đăng nhập không hợp lệ hoặc đã hết hạn', 401, 'AUTH_REFRESH_INVALID');
      }

      if (!refreshTokenMatches(userAuth, raw)) {
        throw createServiceError('Phiên đăng nhập không hợp lệ hoặc đã hết hạn', 401, 'AUTH_REFRESH_INVALID');
      }

      const plainEmail = await hydrateAuthEmailDoc(userAuth);

      return await this.rotateRefreshTokens(userAuth, plainEmail);
    } catch (error) {
      throw error;
    }
  }

  // Đăng xuất
  async logout(userId) {
    try {
      // Kiểm tra trạng thái kết nối theo fail-fast, không reconnect trong request.
      await ensureMongoReady('LOGOUT');

      const userAuth = await UserAuth.findOne({ userId }).maxTimeMS(5000);
      if (userAuth) {
        userAuth.refreshToken = null;
        userAuth.refreshTokenExpiresAt = null;
        await bumpTokenVersion(userAuth);
        await userAuth.save();
      }

      // Xóa refresh token từ Redis
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `refresh_token:${userId}`;
        await redis.del(cacheKey);
      }

      return true;
    } catch (error) {
      throw error;
    }
  }

  // Đổi mật khẩu
  async changePassword(userId, oldPassword, newPassword) {
    try {
      const userAuth = await UserAuth.findOne({ userId });
      if (!userAuth) {
        throw createServiceError('Không tìm thấy tài khoản.', 404, 'AUTH_USER_NOT_FOUND');
      }

      // Kiểm tra old password
      const isOldPasswordValid = await comparePassword(oldPassword, userAuth.password);
      if (!isOldPasswordValid) {
        throw createServiceError('Mật khẩu hiện tại không đúng.', 400, 'AUTH_OLD_PASSWORD_INCORRECT');
      }

      // Validate new password strength
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw createServiceError(
          passwordValidation.errors.join(', '),
          400,
          passwordValidation.errorCode
        );
      }

      // Hash new password
      const hashedPassword = await hashPassword(newPassword);

      // Cập nhật password, thu hồi session cũ rồi cấp JWT mới (bump tv trong issueSessionTokens)
      userAuth.password = hashedPassword;
      userAuth.mustChangePassword = false;
      await userAuth.save();

      const plainEmail = await hydrateAuthEmailDoc(userAuth);
      return await this.issueSessionTokens(userAuth, plainEmail);
    } catch (error) {
      throw error;
    }
  }

  // Quên mật khẩu - tạo reset token
  async forgotPassword(email, frontendUrl) {
    try {
      // Response luôn giống nhau (email lạ / có thật / SMTP lỗi) — chống dò tài khoản.
      const response = { message: FORGOT_PASSWORD_MESSAGE };
      const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';
      if (!normalizedEmail) return response;

      const userAuth = await findUserAuthByEmail(normalizedEmail);
      if (!userAuth) return response;

      const passwordResetToken = crypto.randomBytes(32).toString('hex');
      userAuth.passwordResetToken = hashOneTimeToken(passwordResetToken);
      userAuth.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await userAuth.save();

      if (emailService.isAvailable()) {
        await emailService.sendPasswordResetEmail(normalizedEmail, passwordResetToken, frontendUrl);
      }

      return response;
    } catch (error) {
      throw error;
    }
  }

  // Gửi lại email xác thực
  async resendVerificationEmail(email, frontendUrl) {
    try {
      const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';
      if (!normalizedEmail) {
        throw createServiceError('Email là bắt buộc.', 400, 'VALIDATION_REQUIRED');
      }

      // Response luôn giống nhau (email lạ / đã xác thực / đã gửi) — chống dò tài khoản.
      const response = { message: RESEND_VERIFICATION_MESSAGE };
      const userAuth = await findUserAuthByEmail(normalizedEmail);
      if (!userAuth || userAuth.isEmailVerified) return response;

      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      userAuth.emailVerificationToken = hashOneTimeToken(emailVerificationToken);
      userAuth.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await userAuth.save();

      if (emailService.isAvailable()) {
        const plainEmail = await hydrateAuthEmailDoc(userAuth);
        await emailService.sendVerificationEmail(plainEmail, emailVerificationToken, frontendUrl);
      }

      return response;
    } catch (error) {
      throw error;
    }
  }

  async requestEmailChange(userId, newEmail, frontendUrl) {
    const uid = String(userId || '').trim();
    if (!uid) {
      throw createServiceError('Unauthorized', 401, 'AUTH_UNAUTHORIZED');
    }
    const normalizedEmail = normalizeEmail(newEmail);
    if (!normalizedEmail) {
      throw createServiceError('Email is required', 400, 'AUTH_EMAIL_REQUIRED');
    }

    const userAuth = await UserAuth.findOne({ userId: uid });
    if (!userAuth) {
      throw createServiceError('User not found', 404, 'AUTH_USER_NOT_FOUND');
    }

    const currentEmail = await hydrateAuthEmailDoc(userAuth);
    if (normalizeEmail(currentEmail) === normalizedEmail) {
      throw createServiceError('Email mới trùng email hiện tại', 400, 'AUTH_EMAIL_SAME_AS_CURRENT');
    }

    const existing = await findUserAuthByEmail(normalizedEmail, { maxTimeMS: 15000, lean: true });
    if (existing && String(existing.userId || '') !== String(uid)) {
      throw createServiceError('Email đã được sử dụng', 400, 'AUTH_EMAIL_EXISTS');
    }

    const token = crypto.randomBytes(32).toString('hex');
    userAuth.pendingEmail = normalizedEmail;
    userAuth.emailChangeToken = hashOneTimeToken(token);
    userAuth.emailChangeExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await userAuth.save();

    let emailScheduled = false;
    if (emailService.isAvailable()) {
      const info = await emailService.sendEmailChangeVerificationEmail(normalizedEmail, token, frontendUrl);
      emailScheduled = Boolean(info);
    }
    if (!emailScheduled) {
      logger.warn('Email change verification not scheduled', { tokenLength: token.length });
    }
    return {
      message: 'Nếu email hợp lệ, link xác thực đã được gửi.',
      emailScheduled,
    };
  }

  async verifyEmailChange(token) {
    const verificationToken = readTokenInput(token);
    if (!verificationToken) {
      throw createServiceError('Verification token is required', 400, 'AUTH_EMAIL_CHANGE_TOKEN_REQUIRED');
    }
    const userAuth = await UserAuth.findOne({
      emailChangeToken: oneTimeTokenQuery(verificationToken),
      emailChangeExpiresAt: { $gt: new Date() },
    });
    if (!userAuth) {
      throw createServiceError('Invalid or expired verification token', 400, 'AUTH_EMAIL_CHANGE_TOKEN_INVALID');
    }

    const nextEmail = normalizeEmail(userAuth.pendingEmail);
    if (!nextEmail) {
      throw createServiceError('Yêu cầu đổi email không hợp lệ', 400, 'AUTH_EMAIL_CHANGE_INVALID');
    }

    const existing = await findUserAuthByEmail(nextEmail, { maxTimeMS: 15000, lean: true });
    if (existing && String(existing._id) !== String(userAuth._id)) {
      throw createServiceError('Email đã được sử dụng', 400, 'AUTH_EMAIL_EXISTS');
    }

    Object.assign(userAuth, writeEmailFields(nextEmail));
    userAuth.pendingEmail = null;
    userAuth.pendingEmailBlindIndex = null;
    userAuth.emailChangeToken = null;
    userAuth.emailChangeExpiresAt = null;
    await userAuth.save();

    try {
      await syncUserProfileEmail(userAuth.userId, nextEmail);
    } catch (e) {
      console.warn('[AuthService] verifyEmailChange: failed to sync user-profile email:', e?.message || e);
    }

    return {
      userId: String(userAuth.userId || ''),
      email: nextEmail,
    };
  }

  // Reset mật khẩu
  async resetPassword(resetToken, newPassword) {
    try {
      const token = readTokenInput(resetToken);
      if (!token) {
        throw createServiceError('Mã xác thực không hợp lệ.', 400, 'AUTH_INVALID_TOKEN');
      }
      const userAuth = await UserAuth.findOne({
        passwordResetToken: oneTimeTokenQuery(token),
        passwordResetExpiresAt: { $gt: new Date() },
      });

      if (!userAuth) {
        throw createServiceError(
          'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
          400,
          'AUTH_RESET_TOKEN_INVALID'
        );
      }

      // Validate new password strength
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw createServiceError(
          passwordValidation.errors.join(', '),
          400,
          passwordValidation.errorCode
        );
      }

      // Hash new password
      const hashedPassword = await hashPassword(newPassword);

      // Cập nhật password, xóa reset token và vô hiệu session cũ
      // HR Excel pending: đặt mk qua mail = chứng minh mailbox → kích hoạt tài khoản (hướng A).
      userAuth.password = hashedPassword;
      userAuth.passwordResetToken = null;
      userAuth.passwordResetExpiresAt = null;
      userAuth.refreshToken = null;
      userAuth.refreshTokenExpiresAt = null;
      userAuth.mustChangePassword = false;
      userAuth.isActive = true;
      userAuth.isEmailVerified = true;
      await bumpTokenVersion(userAuth);
      await userAuth.save();

      const redis = getRedisClient();
      if (redis && userAuth.userId) {
        await redis.del(`refresh_token:${userAuth.userId}`);
      }

      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * IT/HR provision.
   * - readyForLogin=true (seed/invite accept): active + verified ngay.
   * - readyForLogin=false (Excel HR): pending — chưa login đến khi đặt mk qua mail hoặc admin activate.
   */
  async provisionUserByAdmin({
    email,
    firstName,
    lastName,
    password,
    systemRole,
    resetPassword = false,
    readyForLogin = false,
  }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw createServiceError('Email là bắt buộc', 400, 'VALIDATION_REQUIRED');
    }
    const fn = String(firstName || '').trim() || 'Nhân';
    const ln = String(lastName || '').trim() || 'Viên';

    const normalizedSystemRole = this.normalizeSystemRole(systemRole);

    await ensureMongoReady('PROVISION');

    const providedPassword = String(password || '').trim();
    const activateNow = Boolean(readyForLogin);

    const existingUser = await findUserAuthByEmail(normalizedEmail, {
      maxTimeMS: 15000,
      lean: false,
    });
    if (existingUser?.userId) {
      let touched = false;
      if (resetPassword && providedPassword) {
        const passwordValidation = validatePasswordStrength(providedPassword);
        if (!passwordValidation.isValid) {
          throw createServiceError(
            passwordValidation.errors.join(', '),
            400,
            passwordValidation.errorCode
          );
        }
        existingUser.password = await hashPassword(providedPassword);
        existingUser.mustChangePassword = false;
        touched = true;
      }
      if (activateNow && normalizedSystemRole) {
        existingUser.systemRole = normalizedSystemRole;
        touched = true;
      }
      if (activateNow) {
        existingUser.mustChangePassword = false;
        existingUser.isActive = true;
        existingUser.isEmailVerified = true;
        touched = true;
      }
      if (touched) await existingUser.save();
      // Re-import / compensate: auth còn mà profile mất → bootstrap lại trước khi org ghi fields.
      await bootstrapUserProfile(existingUser, existingUser.userId);
      // Luôn sync email profile (kể cả không touched) — sửa data bị ghi nhầm email admin.
      try {
        await syncUserProfileEmail(existingUser.userId, normalizedEmail);
      } catch (syncErr) {
        console.warn(
          '[AuthService] syncUserProfileEmail (existing) failed:',
          syncErr?.message || syncErr
        );
      }
      const pendingActivation = !existingUser.isActive && !existingUser.isEmailVerified;
      return {
        userId: String(existingUser.userId),
        email: normalizedEmail,
        created: false,
        systemRole: this.normalizeSystemRole(existingUser.systemRole),
        mustChangePassword: Boolean(existingUser.mustChangePassword),
        temporaryPassword: resetPassword && providedPassword ? providedPassword : undefined,
        isActive: Boolean(existingUser.isActive),
        isEmailVerified: Boolean(existingUser.isEmailVerified),
        pendingActivation,
      };
    }
    if (existingUser && !existingUser.userId) {
      throw createServiceError('Email đang chờ xác thực', 409, 'AUTH_EMAIL_PENDING');
    }

    const tempPassword = providedPassword || generateTemporaryPassword(12);

    const passwordValidation = validatePasswordStrength(tempPassword);
    if (!passwordValidation.isValid) {
      throw createServiceError(
        passwordValidation.errors.join(', '),
        400,
        passwordValidation.errorCode
      );
    }

    const hashedPassword = await hashPassword(tempPassword);
    const userId = new mongoose.Types.ObjectId();
    /** Seed/UAT: admin đã đặt mật khẩu + readyForLogin → không bắt đổi MK lần đầu. */
    const mustChangePassword = !(providedPassword && activateNow);

    const userAuth = new UserAuth({
      userId,
      ...writeEmailFields(normalizedEmail),
      password: hashedPassword,
      firstName: fn,
      lastName: ln,
      systemRole: normalizedSystemRole,
      isEmailVerified: activateNow,
      isActive: activateNow,
      mustChangePassword: activateNow ? mustChangePassword : true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    });

    await userAuth.save();
    await bootstrapUserProfile(userAuth, userId);
    try {
      await syncUserProfileEmail(userId, normalizedEmail);
    } catch (syncErr) {
      console.warn(
        '[AuthService] syncUserProfileEmail (created) failed:',
        syncErr?.message || syncErr
      );
    }

    return {
      userId: userId.toString(),
      email: normalizedEmail,
      created: true,
      systemRole: normalizedSystemRole,
      // Không trả temp password khi pending Excel — NV đặt mk qua mail / admin activate.
      temporaryPassword: activateNow ? tempPassword : undefined,
      mustChangePassword: Boolean(userAuth.mustChangePassword),
      isActive: Boolean(userAuth.isActive),
      isEmailVerified: Boolean(userAuth.isEmailVerified),
      pendingActivation: !activateNow,
    };
  }

  // Xác thực email
  async verifyEmail(verificationToken) {
    try {
      const token = readTokenInput(verificationToken);
      if (!token) {
        throw createServiceError('Mã xác thực không hợp lệ.', 400, 'AUTH_INVALID_TOKEN');
      }
      const userAuth = await UserAuth.findOne({
        emailVerificationToken: oneTimeTokenQuery(token),
        emailVerificationExpiresAt: { $gt: new Date() },
      });

      if (!userAuth) {
        throw createServiceError(
          'Liên kết xác thực không hợp lệ hoặc đã hết hạn.',
          400,
          'AUTH_VERIFY_TOKEN_INVALID'
        );
      }

      // Kiểm tra đã verify chưa
      if (userAuth.isEmailVerified) {
        throw createServiceError('Email đã được xác thực.', 400, 'AUTH_EMAIL_ALREADY_VERIFIED');
      }

      // Tạo userId mới (ObjectId)
      const userId = new mongoose.Types.ObjectId();

      // Cập nhật user auth: verify email, active account, set userId
      userAuth.isEmailVerified = true;
      userAuth.isActive = true;
      userAuth.userId = userId;
      userAuth.emailVerificationToken = null;
      userAuth.emailVerificationExpiresAt = null;
      await userAuth.save();

      // Tạo UserProfile trong user-service (HTTP nội bộ)
      const bootstrap = await bootstrapUserProfile(userAuth, userId);
      if (!bootstrap.ok) {
        console.warn(
          '[AuthService] verifyEmail: UserProfile bootstrap chưa thành công — user có thể đăng nhập lại để thử tạo profile.',
          bootstrap.reason
        );
      }

      const plainEmail = await hydrateAuthEmailDoc(userAuth);

      return {
        userId: userId.toString(),
        email: plainEmail,
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new AuthService();


