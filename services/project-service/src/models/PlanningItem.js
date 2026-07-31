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
    status: {
      type: String,
      enum: PLANNING_ITEM_STATUSES,
      default: 'planned',
      index: true,
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
