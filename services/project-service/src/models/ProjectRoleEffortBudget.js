const mongoose = require('../db');

/**
 * Project instance of role effort budget (planned, not actual).
 * residualHours = unallocated planned hours after allocate-to Task/Meeting.
 */
const allocationLinkSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: ['task', 'meeting'], required: true },
    targetId: { type: String, required: true, trim: true, maxlength: 64 },
    hours: { type: Number, required: true, min: 0, max: 80 },
    weekKey: { type: String, trim: true, default: null, maxlength: 16 },
    allocatedAt: { type: Date, default: Date.now },
    allocatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const projectRoleEffortBudgetSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Project',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    roleKey: { type: String, required: true, trim: true, maxlength: 64 },
    deliveryPhase: { type: String, required: true, trim: true, maxlength: 64 },
    /** Planned hours per week for this role/phase baseline */
    hoursPerWeek: { type: Number, required: true, min: 0, max: 80 },
    /** Phase window for week spread */
    phaseStartDate: { type: Date, default: null },
    phaseEndDate: { type: Date, default: null },
    spreadPolicy: {
      type: String,
      enum: ['even_weeks', 'front_loaded', 'back_loaded'],
      default: 'even_weeks',
    },
    activityLabel: { type: String, trim: true, default: '', maxlength: 160 },
    /** Hours not yet allocated to Task/Meeting (anti-dup residual) */
    residualHoursPerWeek: { type: Number, required: true, min: 0, max: 80 },
    baselineVersion: { type: Number, required: true, min: 1, default: 1 },
    status: {
      type: String,
      enum: ['draft', 'approved', 'superseded'],
      default: 'draft',
      index: true,
    },
    allocationLinks: { type: [allocationLinkSchema], default: [] },
    templateVersion: { type: Number, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

projectRoleEffortBudgetSchema.index(
  { projectId: 1, userId: 1, roleKey: 1, deliveryPhase: 1, baselineVersion: 1 },
  { unique: true }
);
projectRoleEffortBudgetSchema.index({ projectId: 1, status: 1 });
projectRoleEffortBudgetSchema.index({ userId: 1, organizationId: 1, status: 1 });

module.exports = mongoose.model('ProjectRoleEffortBudget', projectRoleEffortBudgetSchema);
