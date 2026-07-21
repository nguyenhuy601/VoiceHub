const { mongoose } = require('@enterprise/shared/config/mongo');

/**
 * Org Role catalog (People Graph) — per-organization custom roles.
 * Defaults (department_manager/team_manager/director) are system roles.
 */
const orgRoleCatalogSchema = new mongoose.Schema(
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
      maxlength: 64,
    },
    label: {
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
    isSystem: {
      type: Boolean,
      default: false,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 100,
    },
  },
  { timestamps: true }
);

orgRoleCatalogSchema.index({ organizationId: 1, key: 1 }, { unique: true });
orgRoleCatalogSchema.index({ organizationId: 1, sortOrder: 1 });

module.exports = mongoose.model('OrgRoleCatalog', orgRoleCatalogSchema);

