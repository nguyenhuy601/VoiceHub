const { mongoose } = require('@enterprise/shared/config/mongo');

const authLoginEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
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

const AuthLoginEvent =
  mongoose.models.AuthLoginEvent || mongoose.model('AuthLoginEvent', authLoginEventSchema);

module.exports = AuthLoginEvent;
