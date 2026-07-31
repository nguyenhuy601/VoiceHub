// Sử dụng cùng instance mongoose với connectDB trong thư mục /shared
const { mongo } = require('@enterprise/shared');
const { mongoose } = mongo;

const userProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: 'UserAuth',
    },
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      // Không dùng lowercase: true — phá hủy ciphertext enc:e1: / enc:v1: (base64 phân biệt hoa thường).
      set(value) {
        const raw = String(value ?? '');
        if (raw.startsWith('enc:e1:') || raw.startsWith('enc:v1:')) return raw;
        return raw.trim().toLowerCase();
      },
    },
    emailBlindIndex: {
      type: String,
      default: null,
      sparse: true,
      unique: true,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    avatar: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      maxlength: 500,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
    },
    /** Chức danh / vị trí làm việc (onboarding first-login) */
    jobTitle: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    /** HMAC blind index cho tra cứu / unique khi phone được mã hóa at-rest */
    phoneBlindIndex: {
      type: String,
    },
    /** Phiên bản mã hóa trường PII (0 = legacy plaintext) */
    encV: {
      type: Number,
      default: 0,
    },
    /** Date (legacy plaintext) hoặc ciphertext string khi bật mã hóa */
    dateOfBirth: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    location: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'away', 'busy'],
      default: 'offline',
    },
    isInvisible: {
      type: Boolean,
      default: false, // Khi true, người khác sẽ không thấy online status
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'auto',
      },
      language: {
        type: String,
        default: 'vi',
      },
      notifications: {
        type: Boolean,
        default: true,
      },
      jobTitle: {
        type: String,
        trim: true,
        maxlength: 120,
        default: '',
      },
      profileCompletedAt: {
        type: String,
        default: null,
      },
    },
    /** Biệt danh hiển thị theo tổ chức — key: organizationId */
    orgNicknames: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    /**
     * Hồ sơ năng lực phục vụ AI gợi ý team (C1).
     * SoT = form; verificationStatus gate: draft → pending_hr → verified|rejected.
     * Không tự cấp Project Role / Permission.
     */
    capability: {
      positionCode: { type: String, trim: true, default: '' },
      primaryDomain: { type: String, trim: true, default: '' },
      yearsExperience: { type: Number, default: null },
      skills: [
        {
          name: { type: String, trim: true },
          level: { type: Number, min: 1, max: 5, default: 3 },
        },
      ],
      languages: [{ type: String, trim: true }],
      tools: [{ type: String, trim: true }],
      availability: {
        type: String,
        enum: ['available', 'busy', 'partial'],
        default: 'available',
      },
      summary: { type: String, maxlength: 1000, default: '' },
      verificationStatus: {
        type: String,
        enum: ['draft', 'pending_hr', 'verified', 'rejected'],
        default: 'draft',
      },
      source: {
        type: String,
        enum: ['manual', 'cv_parse'],
        default: 'manual',
      },
      rejectReason: { type: String, maxlength: 500, default: '' },
      submittedAt: { type: Date, default: null },
      verifiedAt: { type: Date, default: null },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
      rejectedAt: { type: Date, default: null },
      updatedAt: { type: Date, default: null },
      /** C2 — file CV PDF đã upload (relative /uploads/cv/...) */
      cvFilePath: { type: String, trim: true, default: '' },
      cvFileName: { type: String, trim: true, default: '' },
      cvUploadedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

userProfileSchema.index({ 'capability.verificationStatus': 1 });

// Virtual để lấy thông tin cơ bản
userProfileSchema.index({ email: 1 });
userProfileSchema.index(
  { phoneBlindIndex: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phoneBlindIndex: { $type: 'string' },
    },
  }
);

userProfileSchema.virtual('publicInfo').get(function () {
  return {
    userId: this.userId,
    username: this.username,
    email: this.email,
    displayName: this.displayName,
    avatar: this.avatar,
    status: this.status,
  };
});

// Method để cập nhật last seen
userProfileSchema.methods.updateLastSeen = function () {
  this.lastSeen = new Date();
  return this.save();
};

// Method để cập nhật status
userProfileSchema.methods.updateStatus = function (status) {
  this.status = status;
  if (status === 'online' || status === 'offline') {
    this.lastSeen = new Date();
  }
  return this.save();
};

const UserProfile = mongoose.model('UserProfile', userProfileSchema);

module.exports = UserProfile;



