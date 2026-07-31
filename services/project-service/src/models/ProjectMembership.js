const mongoose = require('../db');

/**
 * User ↔ Project Role trong một board/project. Cùng user có thể khác role giữa các project.
 * boardId = projectId (TaskBoard là Project container).
 */
const projectMembershipSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
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

projectMembershipSchema.index({ boardId: 1, userId: 1, projectRoleId: 1 }, { unique: true });
projectMembershipSchema.index({ boardId: 1, userId: 1 });
projectMembershipSchema.index({ userId: 1, organizationId: 1 });

module.exports = mongoose.model('ProjectMembership', projectMembershipSchema);
