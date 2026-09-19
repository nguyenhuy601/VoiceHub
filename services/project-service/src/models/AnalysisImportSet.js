const mongoose = require('../db');
const { IMPORT_SET_STATUSES } = require('../constants/analysisImportSet');

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
  },
  { timestamps: true }
);

analysisImportSetSchema.index({ projectId: 1, status: 1, updatedAt: -1 });
/** At most one ACTIVE Import Set per project */
analysisImportSetSchema.index(
  { projectId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'projectId_1_active_unique',
  }
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

module.exports = mongoose.model('AnalysisImportSet', analysisImportSetSchema);
