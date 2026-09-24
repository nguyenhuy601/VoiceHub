const mongoose = require('../db');
const {
  PLANNING_ARTIFACT_KINDS,
  PLANNING_ARTIFACT_STATUSES,
} = require('../constants/planningArtifact');

const reviewGateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    at: { type: Date, default: null },
    note: { type: String, trim: true, default: '', maxlength: 1000 },
  },
  { _id: false }
);

const planningArtifactSchema = new mongoose.Schema(
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
    kind: {
      type: String,
      enum: PLANNING_ARTIFACT_KINDS,
      required: true,
      index: true,
    },
    externalKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    summary: { type: String, trim: true, default: '', maxlength: 2000 },
    body: { type: String, trim: true, default: '', maxlength: 20000 },
    structured: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    parentExternalKey: { type: String, trim: true, default: '', maxlength: 64 },
    version: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: PLANNING_ARTIFACT_STATUSES,
      default: 'draft',
      index: true,
    },
    source: {
      type: String,
      enum: ['manual', 'ai_suggest', 'import', 'seed'],
      default: 'manual',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    review: {
      ba: { type: reviewGateSchema, default: () => ({}) },
      tech: { type: reviewGateSchema, default: () => ({}) },
      pm: { type: reviewGateSchema, default: () => ({}) },
      po: { type: reviewGateSchema, default: () => ({}) },
    },
    rejectionReason: { type: String, trim: true, default: '', maxlength: 2000 },
    /** Gate that sent changes_requested — resubmit must return here (DEC D9). */
    changesRequestedFrom: {
      type: String,
      trim: true,
      default: '',
      maxlength: 32,
    },
    publishedWorkItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

planningArtifactSchema.index(
  { projectId: 1, kind: 1, externalKey: 1, version: 1 },
  { unique: true }
);
planningArtifactSchema.index({ projectId: 1, kind: 1, status: 1 });

module.exports = mongoose.model('PlanningArtifact', planningArtifactSchema);
