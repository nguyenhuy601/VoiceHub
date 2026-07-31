const mongoose = require('../db');

const decisionSchema = new mongoose.Schema(
  {
    stepIndex: { type: Number, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    decision: {
      type: String,
      enum: ['approve', 'reject'],
      required: true,
    },
    at: { type: Date, default: Date.now },
    comment: { type: String, trim: true, default: '', maxlength: 1000 },
  },
  { _id: false }
);

/**
 * One approval run for an entity transition / stub MR|Release.
 */
const approvalRequestSchema = new mongoose.Schema(
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
    },
    entityType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    policyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'ApprovalPolicy',
      index: true,
    },
    policyKey: {
      type: String,
      trim: true,
      default: '',
      maxlength: 64,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    currentStep: {
      type: Number,
      default: 0,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    fromStatus: { type: String, trim: true, default: '' },
    toStatus: { type: String, trim: true, default: '' },
    previousListId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    targetListId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    decisions: {
      type: [decisionSchema],
      default: [],
    },
    /** Snapshot of policy steps at request time */
    stepsSnapshot: {
      type: [
        {
          order: Number,
          approverType: String,
          roleKey: String,
          userId: mongoose.Schema.Types.ObjectId,
          quorum: Number,
        },
      ],
      default: [],
    },
    cancelledReason: { type: String, trim: true, default: '', maxlength: 240 },
    completedAt: { type: Date, default: null },
    /** P6 audit */
    audit: {
      type: {
        createdIp: { type: String, default: '' },
        lastDecisionIp: { type: String, default: '' },
        notes: { type: String, default: '', maxlength: 500 },
      },
      default: () => ({}),
    },
  },
  { timestamps: true }
);

approvalRequestSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });
approvalRequestSchema.index({ projectId: 1, entityType: 1, entityId: 1, status: 1 });
approvalRequestSchema.index({ entityType: 1, entityId: 1, status: 1 });

module.exports = mongoose.model('ApprovalRequest', approvalRequestSchema);
