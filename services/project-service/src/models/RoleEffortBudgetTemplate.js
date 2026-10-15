const mongoose = require('../db');

/**
 * Org-scoped Role Effort Budget template (Wave 1 Forecast Capacity).
 * Seed source for ProjectRoleEffortBudget — not silent runtime hardcode per project.
 */
const lineSchema = new mongoose.Schema(
  {
    roleKey: { type: String, required: true, trim: true, maxlength: 64 },
    deliveryPhase: { type: String, required: true, trim: true, maxlength: 64 },
    hoursPerWeek: { type: Number, required: true, min: 0, max: 80 },
    activityLabel: { type: String, trim: true, default: '', maxlength: 160 },
    spreadPolicy: {
      type: String,
      enum: ['even_weeks', 'front_loaded', 'back_loaded'],
      default: 'even_weeks',
    },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const roleEffortBudgetTemplateSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1, default: 1 },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    title: { type: String, trim: true, default: '', maxlength: 160 },
    lines: { type: [lineSchema], default: [] },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

roleEffortBudgetTemplateSchema.index({ organizationId: 1, version: 1 }, { unique: true });
roleEffortBudgetTemplateSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('RoleEffortBudgetTemplate', roleEffortBudgetTemplateSchema);
