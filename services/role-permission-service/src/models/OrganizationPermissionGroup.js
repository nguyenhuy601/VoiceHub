const { mongoose } = require('@enterprise/shared/config/mongo');

const organizationPermissionGroupSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    templateKey: { type: String, required: true, trim: true, index: true },
    specialization: { type: String, default: '', trim: true },
    name: { type: String, required: true, trim: true },
    grants: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

organizationPermissionGroupSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('OrganizationPermissionGroup', organizationPermissionGroupSchema);
