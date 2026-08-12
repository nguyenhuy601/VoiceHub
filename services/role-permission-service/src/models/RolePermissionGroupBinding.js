const { mongoose } = require('@enterprise/shared/config/mongo');

const rolePermissionGroupBindingSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    permissionGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    roleLayer: {
      type: String,
      enum: ['organization', 'project'],
      default: 'organization',
    },
    isActive: { type: Boolean, default: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

rolePermissionGroupBindingSchema.index(
  { organizationId: 1, roleId: 1, permissionGroupId: 1, roleLayer: 1 },
  { unique: true }
);

module.exports = mongoose.model('RolePermissionGroupBinding', rolePermissionGroupBindingSchema);
