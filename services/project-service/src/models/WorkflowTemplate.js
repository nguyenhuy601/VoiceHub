const mongoose = require('../db');

const statusSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 64 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    category: {
      type: String,
      trim: true,
      default: 'in_progress',
      maxlength: 32,
    },
    sortOrder: { type: Number, default: 0 },
    isInitial: { type: Boolean, default: false },
    isFinal: { type: Boolean, default: false },
  },
  { _id: false }
);

const transitionSchema = new mongoose.Schema(
  {
    fromKey: { type: String, required: true, trim: true },
    toKey: { type: String, required: true, trim: true },
    name: { type: String, trim: true, default: '', maxlength: 120 },
    requiredPermission: { type: String, trim: true, default: '', maxlength: 64 },
    validators: { type: [String], default: [] },
    conditions: { type: [String], default: [] },
  },
  { _id: false }
);

/**
 * Org catalog workflow templates (Startup / Enterprise / custom).
 * Board copies into WorkflowDefinition when applied.
 */
const workflowTemplateSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    isBuiltin: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    statuses: {
      type: [statusSchema],
      default: [],
    },
    /** Catalog priority khi apply template xuống project. */
    priorities: {
      type: [
        {
          key: { type: String, required: true, trim: true, maxlength: 32 },
          label: { type: String, required: true, trim: true, maxlength: 64 },
          order: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    transitions: {
      type: [transitionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

workflowTemplateSchema.index({ organizationId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('WorkflowTemplate', workflowTemplateSchema);
