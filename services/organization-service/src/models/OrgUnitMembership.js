/**
 * Huy: Membership matrix — user thuộc nhiều Organizational Unit.
 */
const { mongoose } = require('@enterprise/shared/config/mongo');

const orgUnitMembershipSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationalUnit',
      required: true,
      index: true,
    },
    roleInUnit: {
      type: String,
      enum: ['member', 'lead', 'head'],
      default: 'member',
    },
    isPrimary: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

orgUnitMembershipSchema.index(
  { organization: 1, userId: 1, unitId: 1 },
  { unique: true, name: 'uniq_org_user_unit' }
);
orgUnitMembershipSchema.index({ organization: 1, unitId: 1 });

module.exports = mongoose.model('OrgUnitMembership', orgUnitMembershipSchema);
