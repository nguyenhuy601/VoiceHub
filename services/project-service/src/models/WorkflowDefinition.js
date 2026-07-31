const mongoose = require('../db');

const workflowStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 64 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    order: { type: Number, default: 0 },
    isInitial: { type: Boolean, default: false },
    isFinal: { type: Boolean, default: false },
    category: { type: String, trim: true, default: '', maxlength: 32 },
  },
  { _id: false }
);

const workflowTransitionSchema = new mongoose.Schema(
  {
    fromKey: { type: String, required: true, trim: true },
    toKey: { type: String, required: true, trim: true },
    name: { type: String, trim: true, default: '', maxlength: 120 },
    requiredPermission: { type: String, trim: true, default: '', maxlength: 64 },
    validators: { type: [String], default: [] },
    conditions: { type: [String], default: [] },
    /** Phase 5 — gắn ApprovalPolicy (key hoặc id string) */
    requiresApprovalPolicyKey: { type: String, trim: true, default: '', maxlength: 64 },
    requiresApprovalPolicyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApprovalPolicy',
      default: null,
    },
  },
  { _id: false }
);

const workflowDefinitionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
      ref: 'TaskBoard',
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkflowTemplate',
      default: null,
      index: true,
    },
    templateKey: {
      type: String,
      trim: true,
      default: '',
      maxlength: 64,
    },
    name: {
      type: String,
      trim: true,
      default: 'Default',
      maxlength: 120,
    },
    states: {
      type: [workflowStateSchema],
      default: [],
    },
    transitions: {
      type: [workflowTransitionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkflowDefinition', workflowDefinitionSchema);
