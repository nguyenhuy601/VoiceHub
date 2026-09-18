const mongoose = require('../db');
const { IMPORT_SET_STATUSES } = require('../constants/analysisImportSet');

const reviewGateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    at: { type: Date, default: null },
    note: { type: String, trim: true, default: '', maxlength: 1000 },
  },
  { _id: false }
);

const analysisImportSetSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: IMPORT_SET_STATUSES,
      default: 'draft',
      index: true,
    },
    rawDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerDocument',
      default: null,
    },
    analysisDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerDocument',
      default: null,
    },
    packId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RequirementPack',
      default: null,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    deletedAt: { type: Date, default: null },
    trashedAt: { type: Date, default: null },
    lastTrashBatchId: { type: String, trim: true, default: '', maxlength: 128 },
    purgeAfterAt: { type: Date, default: null },
    revertedFromSetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalysisImportSet',
      default: null,
    },
    review: {
      ba: { type: reviewGateSchema, default: () => ({}) },
      tech: { type: reviewGateSchema, default: () => ({}) },
      po: { type: reviewGateSchema, default: () => ({}) },
    },
  },
  { timestamps: true }
);

analysisImportSetSchema.index({ projectId: 1, status: 1, updatedAt: -1 });
/** At most one ACTIVE Import Set per project */
analysisImportSetSchema.index(
  { projectId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);
/** At most one DRAFT Import Set per project */
analysisImportSetSchema.index(
  { projectId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'draft' },
    name: 'projectId_1_draft_unique',
  }
);
/** At most one PENDING_REVIEW Import Set per project */
analysisImportSetSchema.index(
  { projectId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending_review' },
    name: 'projectId_1_pending_review_unique',
  }
);

module.exports = mongoose.model('AnalysisImportSet', analysisImportSetSchema);
