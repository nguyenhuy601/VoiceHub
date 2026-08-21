const mongoose = require('../db');
const { REQUIREMENT_PACK_STATUS, AI_ANALYSIS_STATUS } = require('../constants/requirementLifecycle');

const requirementNodeSchema = new mongoose.Schema(
  {
    externalId: { type: String, required: true, trim: true, maxlength: 64 },
    level: { type: String, required: true, trim: true, maxlength: 32 },
    parentExternalId: { type: String, trim: true, default: '', maxlength: 64 },
    name: { type: String, required: true, trim: true, maxlength: 500 },
    description: { type: String, trim: true, default: '', maxlength: 4000 },
    priority: { type: String, trim: true, default: 'Medium', maxlength: 32 },
    acceptanceCriteria: { type: String, trim: true, default: '', maxlength: 4000 },
    sortOrder: { type: Number, default: 0 },
    suggestedSkills: { type: [String], default: [] },
    estimateHours: { type: Number, default: null, min: 0 },
    suggestedRoleKey: { type: String, trim: true, default: '', maxlength: 64 },
  },
  { _id: false }
);

const staffingSkillSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 128 },
    source: { type: String, enum: ['excel', 'rollup', 'ai'], default: 'rollup' },
  },
  { _id: false }
);

const staffingRoleSchema = new mongoose.Schema(
  {
    roleKey: { type: String, trim: true, required: true, maxlength: 64 },
    requiredCount: { type: Number, default: 1, min: 1 },
    source: { type: String, enum: ['excel', 'rollup', 'ai'], default: 'rollup' },
  },
  { _id: false }
);

const requirementPackSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: REQUIREMENT_PACK_STATUS,
      default: 'draft',
      index: true,
    },
    templateVersion: { type: String, required: true, trim: true, maxlength: 16 },
    versionNumber: { type: Number, default: 1, min: 1 },
    sourceFileName: { type: String, trim: true, default: '', maxlength: 255 },
    sourceFileId: { type: String, trim: true, default: '', maxlength: 128 },
    importSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    excelPreview: { type: mongoose.Schema.Types.Mixed, default: null },
    previewTree: { type: mongoose.Schema.Types.Mixed, default: null },
    importIssues: { type: mongoose.Schema.Types.Mixed, default: null },
    overview: {
      requirementName: { type: String, trim: true, default: '', maxlength: 240 },
      projectObjective: { type: String, trim: true, default: '', maxlength: 4000 },
      businessScope: { type: String, trim: true, default: '', maxlength: 4000 },
      platform: { type: [String], default: [] },
      expectedUsers: { type: String, trim: true, default: '', maxlength: 64 },
      expectedScale: { type: String, trim: true, default: '', maxlength: 128 },
      deadline: { type: Date, default: null },
      startDate: { type: Date, default: null },
      budget: { type: Number, default: null },
      budgetCurrency: { type: String, trim: true, default: '', maxlength: 8 },
      priority: { type: String, trim: true, default: 'Medium', maxlength: 32 },
    },
    staffingPlan: {
      requiredSkills: { type: [staffingSkillSchema], default: [] },
      requiredRoles: { type: [staffingRoleSchema], default: [] },
      estimatedHoursTotal: { type: Number, default: null, min: 0 },
      startDate: { type: Date, default: null },
      budgetCurrency: { type: String, trim: true, default: '', maxlength: 8 },
    },
    aiPlanning: {
      status: {
        type: String,
        enum: AI_ANALYSIS_STATUS,
        default: 'none',
      },
      overlay: { type: mongoose.Schema.Types.Mixed, default: null },
      generatedAt: { type: Date, default: null },
      sourcePackVersion: { type: Number, default: null },
    },
    scope: [
      {
        type: { type: String, enum: ['in', 'out'], required: true },
        description: { type: String, trim: true, default: '', maxlength: 2000 },
      },
    ],
    functionalRequirements: { type: [requirementNodeSchema], default: [] },
    nonFunctionalRequirements: [
      {
        externalId: { type: String, trim: true, maxlength: 64 },
        category: { type: String, trim: true, maxlength: 64 },
        requirement: { type: String, trim: true, maxlength: 2000 },
        target: { type: String, trim: true, maxlength: 500 },
        priority: { type: String, trim: true, maxlength: 32 },
      },
    ],
    technology: [
      {
        category: { type: String, trim: true, maxlength: 128 },
        name: { type: String, trim: true, maxlength: 128 },
        version: { type: String, trim: true, maxlength: 64 },
        mandatory: { type: Boolean, default: false },
        note: { type: String, trim: true, maxlength: 1000 },
      },
    ],
    integration: [
      {
        system: { type: String, trim: true, maxlength: 128 },
        integrationType: { type: String, trim: true, maxlength: 64 },
        direction: { type: String, trim: true, maxlength: 32 },
        description: { type: String, trim: true, maxlength: 2000 },
        required: { type: Boolean, default: true },
      },
    ],
    constraints: [
      {
        type: { type: String, trim: true, maxlength: 64 },
        description: { type: String, trim: true, maxlength: 2000 },
      },
    ],
    dependencies: [
      {
        externalId: { type: String, trim: true, maxlength: 64 },
        dependency: { type: String, trim: true, maxlength: 500 },
        type: { type: String, trim: true, maxlength: 64 },
        requiredDate: { type: Date, default: null },
        impact: { type: String, trim: true, maxlength: 32 },
      },
    ],
    assumptions: [
      {
        externalId: { type: String, trim: true, maxlength: 64 },
        assumption: { type: String, trim: true, maxlength: 2000 },
        impactIfInvalid: { type: String, trim: true, maxlength: 32 },
      },
    ],
    aiAnalysisStatus: {
      type: String,
      enum: AI_ANALYSIS_STATUS,
      default: 'none',
    },
    aiAnalysisId: { type: mongoose.Schema.Types.ObjectId, default: null },
    projectId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    submittedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: '', maxlength: 2000 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

requirementPackSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
requirementPackSchema.index({ organizationId: 1, 'overview.requirementName': 1 });

module.exports = mongoose.model('RequirementPack', requirementPackSchema);
