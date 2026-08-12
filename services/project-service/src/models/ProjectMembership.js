const mongoose = require('../db');

/**
 * User ↔ Project Role trên Project (SSOT).
 * boardId optional (denorm / legacy dual-write ACL).
 */
const projectMembershipSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Project',
    },
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null,
      index: true,
      ref: 'TaskBoard',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    projectRoleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'ProjectRole',
      index: true,
    },
    /** Legacy board role mirror khi migrate */
    legacyBoardRole: {
      type: String,
      enum: ['owner', 'editor', 'viewer', null],
      default: null,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true }
);

projectMembershipSchema.index({ projectId: 1, userId: 1, projectRoleId: 1 }, { unique: true });
projectMembershipSchema.index({ projectId: 1, userId: 1 });
projectMembershipSchema.index({ userId: 1, organizationId: 1 });

module.exports = mongoose.model('ProjectMembership', projectMembershipSchema);
