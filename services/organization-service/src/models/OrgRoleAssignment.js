const { mongoose } = require('@enterprise/shared/config/mongo');

/**
 * Manual Org Role assignment (People Graph roles) — org-wide.
 * Used for KPI/leave display only; not for task assignment authorization.
 */
const orgRoleAssignmentSchema = new mongoose.Schema(
  {
    organizationId: {
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
    roleKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

orgRoleAssignmentSchema.index({ organizationId: 1, userId: 1, roleKey: 1 }, { unique: true });
orgRoleAssignmentSchema.index({ organizationId: 1, roleKey: 1 });
orgRoleAssignmentSchema.index({ organizationId: 1, userId: 1 });

module.exports = mongoose.model('OrgRoleAssignment', orgRoleAssignmentSchema);

