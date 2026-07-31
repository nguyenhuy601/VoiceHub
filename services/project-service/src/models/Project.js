const mongoose = require('../db');

/**
 * Project aggregate (SSOT identity / settings / scope / G1 lifecycle).
 * Board (TaskBoard) is a child — projectId !== boardId.
 */
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '', maxlength: 180 },
    company: { type: String, trim: true, default: '', maxlength: 180 },
    contactPerson: { type: String, trim: true, default: '', maxlength: 180 },
    contractCode: { type: String, trim: true, default: '', maxlength: 64 },
  },
  { _id: false }
);

const methodologySettingsSchema = new mongoose.Schema(
  {
    sprintDurationDays: { type: Number, default: null },
    sprintStartDay: { type: String, trim: true, default: '' },
    wipLimit: { type: Number, default: null },
  },
  { _id: false }
);

const technicalEnvSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, default: 'custom', maxlength: 32 },
    name: { type: String, trim: true, default: '', maxlength: 120 },
    url: { type: String, trim: true, default: '', maxlength: 500 },
  },
  { _id: false }
);

const technicalSetupSchema = new mongoose.Schema(
  {
    repository: {
      url: { type: String, trim: true, default: '', maxlength: 500 },
      provider: { type: String, trim: true, default: '', maxlength: 64 },
      defaultBranch: { type: String, trim: true, default: '', maxlength: 128 },
    },
    stack: {
      languages: { type: [{ type: String, trim: true, maxlength: 64 }], default: [] },
      frameworks: { type: [{ type: String, trim: true, maxlength: 64 }], default: [] },
      databases: { type: [{ type: String, trim: true, maxlength: 64 }], default: [] },
    },
    environments: { type: [technicalEnvSchema], default: [] },
    infrastructure: {
      notes: { type: String, trim: true, default: '', maxlength: 2000 },
      cloudProvider: { type: String, trim: true, default: '', maxlength: 64 },
    },
    cicd: {
      provider: { type: String, trim: true, default: '', maxlength: 64 },
      pipelineUrl: { type: String, trim: true, default: '', maxlength: 500 },
      notes: { type: String, trim: true, default: '', maxlength: 2000 },
    },
    deployment: {
      strategy: { type: String, trim: true, default: '', maxlength: 64 },
      target: { type: String, trim: true, default: '', maxlength: 180 },
      notes: { type: String, trim: true, default: '', maxlength: 2000 },
    },
    completedAt: { type: Date, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const requiredProjectRoleSchema = new mongoose.Schema(
  {
    roleKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    requiredCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const informationLevelOverrideSchema = new mongoose.Schema(
  {
    audience: { type: String, required: true, trim: true, maxlength: 64 },
    level: {
      type: String,
      enum: ['summary', 'details', 'confidential'],
      required: true,
    },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null,
      index: true,
    },
    /** Org-level identity: 'organization' (default). Legacy team|department|division kept for dual-read until migrate. */
    scopeType: {
      type: String,
      enum: ['organization', 'team', 'department', 'division'],
      default: 'organization',
      index: true,
    },
    scopeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    projectCode: {
      type: String,
      trim: true,
      default: '',
      maxlength: 64,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    /** Legacy + expected end alias */
    dueDate: {
      type: Date,
      default: null,
    },
    background: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    /**
     * Legacy binary visibility (dual-read Phase 1).
     * Prefer visibilityMode + visibilityPolicy / org policy.
     */
    visibility: {
      type: String,
      enum: ['private', 'workspace'],
      default: 'private',
    },
    /** inherit = org settings.projectVisibilityPolicy; custom = project.visibilityPolicy */
    visibilityMode: {
      type: String,
      enum: ['inherit', 'custom'],
      default: 'inherit',
      index: true,
    },
    /** Snapshot when visibilityMode=custom (same shape as org projectVisibilityPolicy) */
    visibilityPolicy: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    informationLevelOverrides: {
      type: [informationLevelOverrideSchema],
      default: [],
    },
    /** Departments participating — discover + resource filter; NOT RBAC */
    relatedDepartmentIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
      index: true,
    },
    status: {
      type: String,
      enum: ['planning', 'ready_for_planning', 'in_development', 'on_hold', 'closed'],
      default: 'planning',
      index: true,
    },
    projectType: {
      type: String,
      enum: ['software', 'integration', 'maintenance', 'research', 'other'],
      default: 'software',
    },
    category: {
      type: String,
      enum: ['internal', 'customer'],
      default: 'internal',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    tags: {
      type: [{ type: String, trim: true, maxlength: 48 }],
      default: [],
    },
    startDate: {
      type: Date,
      default: null,
    },
    expectedEndDate: {
      type: Date,
      default: null,
    },
    estimatedDurationDays: {
      type: Number,
      default: null,
    },
    workingCalendar: {
      type: String,
      trim: true,
      default: 'standard',
      maxlength: 64,
    },
    methodology: {
      type: String,
      enum: ['scrum', 'kanban', 'waterfall'],
      default: 'kanban',
    },
    methodologySettings: {
      type: methodologySettingsSchema,
      default: () => ({}),
    },
    /** Phase 4 — org WorkflowTemplate bind (boards clone khi apply). */
    workflowTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkflowTemplate',
      default: null,
      index: true,
    },
    /** Phase 5 — default policy khi chuyển task → done (nếu transition không gắn riêng). */
    defaultTaskDoneApprovalPolicyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApprovalPolicy',
      default: null,
      index: true,
    },
    customer: {
      type: customerSchema,
      default: null,
    },
    technicalSetup: {
      type: technicalSetupSchema,
      default: () => ({}),
    },
    requiredProjectRoles: {
      type: [requiredProjectRoleSchema],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    /** Phase 6 — soft-archive timestamp */
    archivedAt: {
      type: Date,
      default: null,
      index: true,
    },
    /** Days to retain after archive (null → org GovernanceSettings.defaultRetentionDays) */
    retentionDays: {
      type: Number,
      default: null,
      min: 1,
      max: 3650,
    },
    retentionUntil: {
      type: Date,
      default: null,
      index: true,
    },
    /** Budget placeholder — not ERP accounting */
    budgetStub: {
      type: {
        amount: { type: Number, default: null },
        currency: { type: String, trim: true, default: 'VND', maxlength: 8 },
        note: { type: String, trim: true, default: '', maxlength: 240 },
      },
      default: null,
    },
  },
  { timestamps: true }
);

projectSchema.index({ organizationId: 1, scopeType: 1, scopeId: 1, isActive: 1, createdAt: -1 });
projectSchema.index({ organizationId: 1, status: 1, isActive: 1 });
projectSchema.index(
  { organizationId: 1, projectCode: 1 },
  { unique: true, partialFilterExpression: { projectCode: { $gt: '' } } }
);

module.exports = mongoose.model('Project', projectSchema);
