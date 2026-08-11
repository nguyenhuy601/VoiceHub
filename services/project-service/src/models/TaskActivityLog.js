const mongoose = require('../db');

/**
 * Append-only activity for project / board / task.
 */
const taskActivityLogSchema = new mongoose.Schema(
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
      default: null,
      index: true,
      ref: 'TaskBoard',
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
      ref: 'Task',
    },
    planningItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
      ref: 'PlanningItem',
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

taskActivityLogSchema.index({ projectId: 1, createdAt: -1 });
taskActivityLogSchema.index({ taskId: 1, createdAt: -1 });
taskActivityLogSchema.index({ planningItemId: 1, createdAt: -1 });

module.exports = mongoose.model('TaskActivityLog', taskActivityLogSchema);
