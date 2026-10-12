const mongoose = require('../db');

/**
 * Org-scoped effort estimation configuration (versioned).
 * Activity catalog + rules + capacity policy — not hardcode in engines.
 */
const activitySchema = new mongoose.Schema(
  {
    activityId: { type: String, required: true, trim: true, maxlength: 64 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    workType: {
      type: String,
      enum: ['MEETING', 'GOVERNANCE', 'DELIVERY', 'OTHER'],
      default: 'MEETING',
    },
    applicableRoleKeys: { type: [String], default: [] },
    estimationMethod: {
      type: String,
      enum: ['fixed', 'recurring_weekly', 'per_task'],
      default: 'recurring_weekly',
    },
    effortHoursPerUnit: { type: Number, min: 0, max: 80, default: 2 },
    unitsPerPeriod: { type: Number, min: 0, max: 40, default: 1 },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const capacityPolicySchema = new mongoose.Schema(
  {
    hoursPerWeekDefault: { type: Number, min: 1, max: 80, default: 40 },
    overloadWarnPct: { type: Number, min: 50, max: 200, default: 100 },
    planExceedSuggestChangePct: { type: Number, min: 5, max: 100, default: 20 },
    timezone: { type: String, trim: true, default: 'Asia/Ho_Chi_Minh', maxlength: 64 },
  },
  { _id: false }
);

const effortEstimationConfigSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    title: { type: String, trim: true, default: '', maxlength: 160 },
    activities: { type: [activitySchema], default: [] },
    capacityPolicy: { type: capacityPolicySchema, default: () => ({}) },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

effortEstimationConfigSchema.index(
  { organizationId: 1, version: 1 },
  { unique: true }
);
effortEstimationConfigSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('EffortEstimationConfig', effortEstimationConfigSchema);
