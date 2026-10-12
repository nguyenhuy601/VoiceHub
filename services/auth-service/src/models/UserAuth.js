const { mongoose } = require('@enterprise/shared/config/mongo');

const userAuthSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false, // Sẽ được tạo sau khi verify email
      // CẤM populate User — model User không đăng ký trong auth-service.
      ref: 'User',
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    /** HMAC blind index khi email at-rest được mã hóa */
    emailBlindIndex: {
      type: String,
      default: null,
      sparse: true,
    },
    encV: {
      type: Number,
      default: 0,
    },
    password: {
      type: String,
      required: true,
    },
    // Thông tin tạm thời (sẽ được xóa sau khi verify email và tạo UserProfile)
    firstName: {
      type: String,
      required: false,
      trim: true,
    },
    lastName: {
      type: String,
      required: false,
      trim: true,
    },
    dateOfBirth: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    refreshToken: {
      type: String,
      default: null,
    },
    refreshTokenExpiresAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: false, // Chỉ active sau khi verify email
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
    },
    emailVerificationExpiresAt: {
      type: Date,
      default: null,
    },
    pendingEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    pendingEmailBlindIndex: {
      type: String,
      default: null,
      sparse: true,
    },
    emailChangeToken: {
      type: String,
      default: null,
    },
    emailChangeExpiresAt: {
      type: Date,
      default: null,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    /** Số lần đã bị soft-lock 15s; đủ ngưỡng → khóa tạm (cần admin mở). */
    softLockCount: {
      type: Number,
      default: 0,
    },
    /** Tăng khi logout/đổi mật khẩu để vô hiệu access token cũ */
    tokenVersion: {
      type: Number,
      default: 0,
    },
    /** Admin provision — bắt buộc đổi mật khẩu lần đầu */
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    /** Vai trò tài khoản hệ thống: admin hoặc nhân viên */
    systemRole: {
      type: String,
      enum: ['admin', 'employee'],
      default: 'employee',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        delete ret.refreshTokenExpiresAt;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpiresAt;
        delete ret.emailChangeToken;
        delete ret.emailChangeExpiresAt;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpiresAt;
        delete ret.pendingEmail;
        delete ret.pendingEmailBlindIndex;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        delete ret.softLockCount;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        delete ret.refreshTokenExpiresAt;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpiresAt;
        delete ret.emailChangeToken;
        delete ret.emailChangeExpiresAt;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpiresAt;
        delete ret.pendingEmail;
        delete ret.pendingEmailBlindIndex;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        delete ret.softLockCount;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Unique: plaintext email (legacy / encryption off) hoặc blind index (encryption on)
userAuthSchema.index({ email: 1 }, { unique: true, sparse: true });
userAuthSchema.index({ emailBlindIndex: 1 }, { unique: true, sparse: true });
userAuthSchema.index({ userId: 1 }, { unique: true, sparse: true });
userAuthSchema.index({ refreshToken: 1 });

/** Sai MK bao nhiêu lần thì soft-lock 15s. */
const LOGIN_FAILS_BEFORE_SOFT_LOCK = Math.max(
  1,
  Number(process.env.LOGIN_FAILS_BEFORE_SOFT_LOCK || 3) || 3
);
/** Thời gian soft-lock (ms). */
const LOGIN_SOFT_LOCK_MS = Math.max(
  1000,
  Number(process.env.LOGIN_SOFT_LOCK_MS || 15_000) || 15_000
);
/** Soft-lock bao nhiêu lần thì khóa tạm (cần admin mở). */
const LOGIN_SOFT_LOCKS_BEFORE_HARD = Math.max(
  1,
  Number(process.env.LOGIN_SOFT_LOCKS_BEFORE_HARD || 3) || 3
);
/** Khóa tạm dài — chỉ hết khi admin mở (không tự hết trong thực tế). */
const LOGIN_HARD_LOCK_MS = Math.max(
  LOGIN_SOFT_LOCK_MS,
  Number(process.env.LOGIN_HARD_LOCK_MS || 100 * 365 * 24 * 60 * 60 * 1000) ||
    100 * 365 * 24 * 60 * 60 * 1000
);

// Virtual để kiểm tra account có bị lock không
userAuthSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Method để tăng số lần đăng nhập sai
userAuthSchema.methods.incLoginAttempts = async function () {
  // Soft-lock đã hết hạn → bắt đầu chu kỳ đếm mới (giữ softLockCount).
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const nextAttempts = Number(this.loginAttempts || 0) + 1;
  if (nextAttempts < LOGIN_FAILS_BEFORE_SOFT_LOCK || this.isLocked) {
    return this.updateOne({ $inc: { loginAttempts: 1 } });
  }

  const nextSoftLocks = Number(this.softLockCount || 0) + 1;
  if (nextSoftLocks >= LOGIN_SOFT_LOCKS_BEFORE_HARD) {
    // Khóa tạm tài khoản — cần admin mở khóa.
    return this.updateOne({
      $set: {
        loginAttempts: 0,
        softLockCount: nextSoftLocks,
        lockUntil: new Date(Date.now() + LOGIN_HARD_LOCK_MS),
      },
    });
  }

  // Soft-lock 15s sau 3 lần sai.
  return this.updateOne({
    $set: {
      loginAttempts: 0,
      softLockCount: nextSoftLocks,
      lockUntil: new Date(Date.now() + LOGIN_SOFT_LOCK_MS),
    },
  });
};

// Method để reset login attempts
userAuthSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({
    $set: { loginAttempts: 0, softLockCount: 0 },
    $unset: { lockUntil: 1 },
  });
};

const UserAuth = mongoose.model('UserAuth', userAuthSchema);

UserAuth.LOGIN_FAILS_BEFORE_SOFT_LOCK = LOGIN_FAILS_BEFORE_SOFT_LOCK;
UserAuth.LOGIN_SOFT_LOCK_MS = LOGIN_SOFT_LOCK_MS;
UserAuth.LOGIN_SOFT_LOCKS_BEFORE_HARD = LOGIN_SOFT_LOCKS_BEFORE_HARD;

module.exports = UserAuth;
