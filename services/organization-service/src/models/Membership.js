const { mongoose } = require('@enterprise/shared/config/mongo');

// CẤM populate path `user` — model User không đăng ký trong organization-service.

const membershipSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'hr', 'member'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended'],
      default: 'active',
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique user-organization pair
membershipSchema.index({ user: 1, organization: 1 }, { unique: true });
membershipSchema.index({ organization: 1, role: 1, status: 1 });

/**
 * System/Tenant membership only (owner|admin|hr|member).
 * P1: `department_head` / `team_leader` KHÔNG elevate System admin —
 * chúng là Organization Role trên People Graph (xem organizationRoles.service).
 * @see @enterprise/shared/config/roleTaxonomy LEGACY_MEMBERSHIP_ALIAS_DEBT
 */
membershipSchema.statics.normalizeRole = (role) => {
  const roleMap = {
    owner: 'owner',
    admin: 'admin',
    hr: 'hr',
    human_resources: 'hr',
    nhan_su: 'hr',
    member: 'member',
    org_admin: 'admin',
    department_head: 'member',
    team_leader: 'member',
    employee: 'member',
  };

  return roleMap[role] || 'member';
};

module.exports = mongoose.model('Membership', membershipSchema);
