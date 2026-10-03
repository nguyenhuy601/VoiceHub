const mongoose = require('../db');

const GATE_TYPES = Object.freeze(['BA_GATE_1']);
const STATUSES = Object.freeze([
  'IN_REVIEW',
  'SUBMITTED',
  'WITHDRAWN',
  'APPROVED',
  'REJECTED',
]);

const REVIEW_POLICY_VERSION_DEFAULT = 'GATE1-SOP-1.0';

/**
 * Gate1 BA review session — Proposal ≠ Review.
 */
const gateReviewSchema = new mongoose.Schema(
  {
    reviewId: {
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
    gate: {
      type: String,
      enum: GATE_TYPES,
      default: 'BA_GATE_1',
    },
    snapshotId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
    reviewPolicyVersion: {
      type: String,
      default: REVIEW_POLICY_VERSION_DEFAULT,
      trim: true,
      maxlength: 64,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'IN_REVIEW',
      index: true,
    },
    round: { type: Number, default: 1, min: 1 },
    startedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    startedAt: { type: Date, default: Date.now },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    submittedAt: { type: Date, default: null },
    activeSubmissionId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

gateReviewSchema.index({ packId: 1, status: 1, round: -1 });
gateReviewSchema.index({ organizationId: 1, packId: 1 });

module.exports = mongoose.model('GateReview', gateReviewSchema);
module.exports.GATE_TYPES = GATE_TYPES;
module.exports.STATUSES = STATUSES;
module.exports.REVIEW_POLICY_VERSION_DEFAULT = REVIEW_POLICY_VERSION_DEFAULT;
