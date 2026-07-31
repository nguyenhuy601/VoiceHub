const mongoose = require('../db');

const stepSchema = new mongoose.Schema(
  {
    order: { type: Number, default: 1 },
    approverType: {
      type: String,
      enum: ['project_role', 'user', 'org_role'],
      default: 'project_role',
    },
    roleKey: { type: String, trim: true, default: '', maxlength: 64 },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    quorum: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

/**
 * Org-level approval policy templates (Task Done / MR / Release).
 */
const approvalPolicySchema = new mongoose.Schema(
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
    entityTypes: {
      type: [{ type: String, trim: true, maxlength: 32 }],
      default: ['task'],
    },
    steps: {
      type: [stepSchema],
      default: [],
    },
    isBuiltin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

approvalPolicySchema.index({ organizationId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('ApprovalPolicy', approvalPolicySchema);
