const { mongoose } = require('@enterprise/shared/config/mongo');

const authLoginEventSchema = new mongoose.Schema(
  {
    /** Null when email unknown (fail without matched UserAuth). */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null,
      index: true,
    },
    /** SHA-256 hex of normalized email when userId is absent — never plaintext. */
    emailHash: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
      index: true,
    },
    success: {
      type: Boolean,
      default: true,
    },
    ip: {
      type: String,
      default: null,
      trim: true,
    },
    userAgent: {
      type: String,
      default: null,
      trim: true,
    },
    errorCode: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

authLoginEventSchema.index({ userId: 1, createdAt: -1 });
authLoginEventSchema.index({ emailHash: 1, createdAt: -1 });

const AuthLoginEvent =
  mongoose.models.AuthLoginEvent || mongoose.model('AuthLoginEvent', authLoginEventSchema);

module.exports = AuthLoginEvent;
