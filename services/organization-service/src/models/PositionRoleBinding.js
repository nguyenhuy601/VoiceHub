const { mongoose } = require('@enterprise/shared/config/mongo');

/**
 * Default Org Roles bound to a Position.
 */
const positionRoleBindingSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    positionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationalPosition',
      required: true,
      index: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationalRole',
      required: true,
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

positionRoleBindingSchema.index(
  { organizationId: 1, positionId: 1, roleId: 1 },
  { unique: true }
);

module.exports = mongoose.model('PositionRoleBinding', positionRoleBindingSchema);
