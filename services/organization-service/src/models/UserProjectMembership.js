const { mongoose } = require('@enterprise/shared/config/mongo');

const userProjectMembershipSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, trim: true },
    organizationId: { type: String, required: true, trim: true },
    projectIds: { type: [String], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'user_project_membership' }
);

userProjectMembershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
userProjectMembershipSchema.index({ organizationId: 1, projectIds: 1 });

module.exports = mongoose.model('UserProjectMembership', userProjectMembershipSchema);
