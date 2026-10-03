const mongoose = require('../db');

/**
 * Immutable proposal-item revision (Gate1 Review Trust Wave A).
 * Never update content in place — always insert a new revision.
 */
const ORIGINS = Object.freeze([
  'AI_GENERATED',
  'BA_EDITED',
  'LEGACY_BASELINE',
  'SYSTEM_BASELINE',
]);

const artifactRevisionSchema = new mongoose.Schema(
  {
    revisionId: {
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
      default: null,
      trim: true,
      maxlength: 64,
      index: true,
    },
    artifactType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 48,
    },
    logicalId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 96,
      index: true,
    },
    section: {
      type: String,
      default: '',
      trim: true,
      maxlength: 64,
    },
    revisionNo: { type: Number, required: true, min: 1 },
    parentRevisionId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
    origin: {
      type: String,
      enum: ORIGINS,
      required: true,
    },
    content: { type: mongoose.Schema.Types.Mixed, required: true },
    contentHash: {
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
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    createdByType: {
      type: String,
      enum: ['HUMAN', 'AI', 'SYSTEM'],
      default: 'SYSTEM',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

artifactRevisionSchema.index({ packId: 1, logicalId: 1, revisionNo: -1 });
artifactRevisionSchema.index({ organizationId: 1, packId: 1, createdAt: -1 });

module.exports = mongoose.model('ArtifactRevision', artifactRevisionSchema);
module.exports.ORIGINS = ORIGINS;
