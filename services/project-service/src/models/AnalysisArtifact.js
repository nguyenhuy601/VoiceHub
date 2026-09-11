const mongoose = require('../db');
const {
  ANALYSIS_ARTIFACT_KINDS,
  ANALYSIS_ARTIFACT_STATUSES,
  ANALYSIS_ARTIFACT_SOURCES,
} = require('../constants/analysisArtifact');

const reviewGateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    at: { type: Date, default: null },
    note: { type: String, trim: true, default: '', maxlength: 1000 },
  },
  { _id: false }
);

const analysisArtifactSchema = new mongoose.Schema(
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
      enum: ANALYSIS_ARTIFACT_KINDS,
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
    source: {
      type: String,
      enum: ANALYSIS_ARTIFACT_SOURCES,
      default: 'manual',
      index: true,
    },
    sourceDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerDocument',
      default: null,
    },
    sourcePackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RequirementPack',
      default: null,
      index: true,
    },
    version: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: ANALYSIS_ARTIFACT_STATUSES,
      default: 'draft',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    review: {
      ba: { type: reviewGateSchema, default: () => ({}) },
      tech: { type: reviewGateSchema, default: () => ({}) },
      po: { type: reviewGateSchema, default: () => ({}) },
    },
    contentHash: { type: String, trim: true, default: '', maxlength: 64 },
    rejectionReason: { type: String, trim: true, default: '', maxlength: 2000 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

analysisArtifactSchema.index(
  { projectId: 1, kind: 1, externalKey: 1, version: 1 },
  { unique: true }
);
analysisArtifactSchema.index({ projectId: 1, kind: 1, status: 1 });

module.exports = mongoose.model('AnalysisArtifact', analysisArtifactSchema);
