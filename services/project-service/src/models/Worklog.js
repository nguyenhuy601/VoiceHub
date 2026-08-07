/**
 * Append-only worklog — Actual Hours (Phase 3b).
 * Does not write ProjectMember.allocations (Planned Allocation stays P3-only).
 */
const mongoose = require('../db');

const worklogSchema = new mongoose.Schema(
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
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Task',
    },
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
      ref: 'TaskBoard',
    },
    /** Denorm from Task.sprintId at create time */
    sprintId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
      ref: 'Sprint',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    workDate: {
      type: Date,
      required: true,
      index: true,
    },
    hours: {
      type: Number,
      required: true,
      min: 0.25,
      max: 24,
    },
    note: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

worklogSchema.index({ taskId: 1, workDate: -1 });
worklogSchema.index({ projectId: 1, userId: 1, workDate: 1 });
worklogSchema.index({ sprintId: 1, workDate: 1 });
worklogSchema.index({ organizationId: 1, userId: 1, workDate: 1 });

module.exports = mongoose.model('Worklog', worklogSchema);
