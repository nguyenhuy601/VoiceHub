const mongoose = require('../db');
const { IMPORT_SESSION_STATUS } = require('../constants/requirementLifecycle');

const validationIssueSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, maxlength: 64 },
    sheet: { type: String, trim: true, default: '', maxlength: 64 },
    row: { type: Number, default: null },
    column: { type: String, trim: true, default: '', maxlength: 64 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    severity: { type: String, enum: ['error', 'warning'], required: true },
  },
  { _id: false }
);

const requirementImportSessionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    fileName: { type: String, trim: true, default: '', maxlength: 255 },
    templateVersion: { type: String, trim: true, default: '', maxlength: 16 },
    status: {
      type: String,
      enum: IMPORT_SESSION_STATUS,
      default: 'preview',
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    errorCount: { type: Number, default: 0 },
    warningCount: { type: Number, default: 0 },
    issues: { type: [validationIssueSchema], default: [] },
    summary: {
      functionalCount: { type: Number, default: 0 },
      nfrCount: { type: Number, default: 0 },
      scopeCount: { type: Number, default: 0 },
    },
    previewPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    previewTree: { type: mongoose.Schema.Types.Mixed, default: null },
    excelPreview: { type: mongoose.Schema.Types.Mixed, default: null },
    fileBuffer: { type: Buffer, default: undefined },
    fileContentType: {
      type: String,
      trim: true,
      default: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      maxlength: 128,
    },
    requirementPackId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    newSkillsDetected: { type: [mongoose.Schema.Types.Mixed], default: [] },
    skillResolveEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

requirementImportSessionSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('RequirementImportSession', requirementImportSessionSchema);
