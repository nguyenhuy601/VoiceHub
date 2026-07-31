const mongoose = require('../db');

/**
 * Board (Kanban) — child of Project. Identity/settings live on Project.
 * projectId !== board._id (greenfield).
 */
const taskBoardSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Project',
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    /** Denorm from Project for board ACL / list filters */
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null,
      index: true,
    },
    /** Denorm from Project — org-level default; legacy team|department|division until migrate. */
    scopeType: {
      type: String,
      enum: ['organization', 'team', 'department', 'division'],
      default: 'organization',
      index: true,
    },
    scopeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
      default: 'Main',
    },
    background: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    /** WorkflowDefinition gắn board — null = dùng enum status mặc định. */
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkflowDefinition',
      default: null,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

taskBoardSchema.index({ organizationId: 1, projectId: 1, isActive: 1 });
taskBoardSchema.index({ organizationId: 1, teamId: 1, isActive: 1, createdAt: -1 });
taskBoardSchema.index({ organizationId: 1, scopeType: 1, scopeId: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model('TaskBoard', taskBoardSchema);
