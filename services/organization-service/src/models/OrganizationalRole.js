const { mongoose } = require('@enterprise/shared/config/mongo');

/**
 * Organizational Role — per-org entity (Permission+Scope carrier).
 * Not a master Catalog sync row.
 */
const organizationalRoleSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 800,
    },
    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'active',
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 100,
    },
    isSystemSeed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

organizationalRoleSchema.index({ organizationId: 1, code: 1 }, { unique: true });
organizationalRoleSchema.index({ organizationId: 1, sortOrder: 1 });

module.exports = mongoose.model('OrganizationalRole', organizationalRoleSchema);
