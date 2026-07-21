const { mongoose } = require('@enterprise/shared/config/mongo');

const responsibilitySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

responsibilitySchema.index({ organizationId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('Responsibility', responsibilitySchema);
