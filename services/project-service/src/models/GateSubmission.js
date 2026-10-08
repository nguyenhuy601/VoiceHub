const mongoose = require('../db');

const STATUSES = Object.freeze(['ACTIVE', 'WITHDRAWN', 'SUPERSEDED', 'APPROVED']);

/**
 * Immutable Gate1 submission manifest — PO reviews this, not mutable current state.
 */
const gateSubmissionSchema = new mongoose.Schema(
  {
    submissionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 64,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    packId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    reviewId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: true,
    },
    sequenceNo: { type: Number, required: true, min: 1 },
    /** [{ logicalId, revisionId, action }] */
    revisionManifest: {
      type: [mongoose.Schema.Types.Mixed],
      required: true,
      default: () => [],
    },
    manifestHash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 96,
    },
    snapshotId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
    reviewPolicyVersion: {
      type: String,
      default: 'GATE1-SOP-1.0',
      trim: true,
      maxlength: 64,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'ACTIVE',
      index: true,
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    submittedAt: { type: Date, default: Date.now },
    withdrawnAt: { type: Date, default: null },
    withdrawnBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

gateSubmissionSchema.index({ packId: 1, sequenceNo: -1 });
gateSubmissionSchema.index({ packId: 1, status: 1 });

module.exports = mongoose.model('GateSubmission', gateSubmissionSchema);
module.exports.STATUSES = STATUSES;
