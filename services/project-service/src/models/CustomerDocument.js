const mongoose = require('../db');
const { CUSTOMER_DOC_CLASSES } = require('../constants/analysisArtifact');

const customerDocumentSchema = new mongoose.Schema(
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
    filename: { type: String, required: true, trim: true, maxlength: 260 },
    mimeType: { type: String, trim: true, default: '', maxlength: 120 },
    storageKey: { type: String, trim: true, default: '', maxlength: 512 },
    sizeBytes: { type: Number, default: null },
    docClass: {
      type: String,
      enum: CUSTOMER_DOC_CLASSES,
      default: 'other',
      index: true,
    },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    linkedArtifactIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AnalysisArtifact' }],
      default: [],
    },
    importSetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalysisImportSet',
      default: null,
      index: true,
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

customerDocumentSchema.index({ projectId: 1, createdAt: -1 });
customerDocumentSchema.index({ projectId: 1, importSetId: 1, isActive: 1 });

module.exports = mongoose.model('CustomerDocument', customerDocumentSchema);
