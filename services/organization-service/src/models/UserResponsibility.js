const { mongoose } = require('@enterprise/shared/config/mongo');

const userResponsibilitySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    responsibilityKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

userResponsibilitySchema.index(
  { organizationId: 1, userId: 1, responsibilityKey: 1 },
  { unique: true }
);
userResponsibilitySchema.index({ organizationId: 1, responsibilityKey: 1 });

module.exports = mongoose.model('UserResponsibility', userResponsibilitySchema);
