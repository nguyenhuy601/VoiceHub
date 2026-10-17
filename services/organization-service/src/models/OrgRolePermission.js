const { mongoose } = require('@enterprise/shared/config/mongo');

const SCOPE_TYPES = Object.freeze(['SELF', 'DEPARTMENT', 'ORGANIZATION', 'SYSTEM']);

/**
 * Permission + scope bound to an Organizational Role.
 */
const orgRolePermissionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationalRole',
      required: true,
      index: true,
    },
    permissionCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    scopeType: {
      type: String,
      enum: SCOPE_TYPES,
      required: true,
      default: 'ORGANIZATION',
    },
  },
  { timestamps: true }
);

orgRolePermissionSchema.index(
  { organizationId: 1, roleId: 1, permissionCode: 1 },
  { unique: true }
);

module.exports = mongoose.model('OrgRolePermission', orgRolePermissionSchema);
module.exports.SCOPE_TYPES = SCOPE_TYPES;
