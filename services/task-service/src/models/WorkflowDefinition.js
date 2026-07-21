const mongoose = require('../db');

const workflowStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 64 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    order: { type: Number, default: 0 },
    isInitial: { type: Boolean, default: false },
    isFinal: { type: Boolean, default: false },
  },
  { _id: false }
);

const workflowTransitionSchema = new mongoose.Schema(
  {
    fromKey: { type: String, required: true, trim: true },
    toKey: { type: String, required: true, trim: true },
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
