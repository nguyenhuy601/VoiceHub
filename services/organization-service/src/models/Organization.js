const { mongoose } = require('/shared/config/mongo');

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 1000,
      default: '',
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    logo: {
      type: String,
      default: null,
    },
    settings: {
      allowPublicJoin: {
        type: Boolean,
        default: false,
      },
      requireApproval: {
        type: Boolean,
        default: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
organizationSchema.index({ ownerId: 1 });
organizationSchema.index({ name: 1 });
organizationSchema.index({ isActive: 1 });

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;



