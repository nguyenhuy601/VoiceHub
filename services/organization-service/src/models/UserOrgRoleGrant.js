const { mongoose } = require('@enterprise/shared/config/mongo');

/**
 * Grant vai trò tổ chức cho đúng một user (ngoài vị trí).
 * Unique: một org, một user, một role.
 */
const userOrgRoleGrantSchema = new mongoose.Schema(
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
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationalRole',
      required: true,
    },
  },
  { timestamps: true }
);

userOrgRoleGrantSchema.index(
  { organizationId: 1, userId: 1, roleId: 1 },
  { unique: true }
);

module.exports = mongoose.model('UserOrgRoleGrant', userOrgRoleGrantSchema);
