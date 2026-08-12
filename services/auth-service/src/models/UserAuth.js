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

// Virtual để kiểm tra account có bị lock không
userAuthSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Method để tăng số lần đăng nhập sai
userAuthSchema.methods.incLoginAttempts = async function () {
  // Nếu đã unlock hoặc chưa lock, reset loginAttempts
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account sau 5 lần đăng nhập sai trong 2 giờ
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }

  return this.updateOne(updates);
};

// Method để reset login attempts
userAuthSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 },
  });
};

const UserAuth = mongoose.model('UserAuth', userAuthSchema);

module.exports = UserAuth;




