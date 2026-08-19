const mongoose = require('../db');
const {
  PLANNING_ITEM_TYPES,
  PLANNING_ITEM_STATUSES,
} = require('../utils/planningItemTypes');

const planningItemSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: PLANNING_ITEM_TYPES,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 4000,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlanningItem',
      default: null,
      index: true,
    },
    targetDate: {
      type: Date,
      default: null,
    },
    startDate: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    /** Legacy planned/active/done/cancelled hoặc statusKey cột board. */
    status: {
      type: String,
      trim: true,
      default: 'planned',
      maxlength: 32,
      index: true,
    },
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    priority: {
      type: String,
      trim: true,
      default: 'medium',
      maxlength: 32,
    },
    sortOrder: {
      type: Number,
      default: 1000,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    /** Work-group chat channel (kind 'workgroup'). Set on Feature only. */
    workGroupChannelId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    sprintId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sprint',
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

planningItemSchema.index({ projectId: 1, type: 1, sortOrder: 1 });
planningItemSchema.index({ projectId: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model('PlanningItem', planningItemSchema);
module.exports.PLANNING_ITEM_TYPES = PLANNING_ITEM_TYPES;
module.exports.PLANNING_ITEM_STATUSES = PLANNING_ITEM_STATUSES;
