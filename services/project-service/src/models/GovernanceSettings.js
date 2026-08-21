const mongoose = require('../db');

/**
 * Org-level retention / governance toggles (Phase 6 Wave B).
 */
const governanceSettingsSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },
    /** Soft-archive inactive projects older than N days (job stub). */
    archiveInactiveAfterDays: {
      type: Number,
      default: 90,
      min: 0,
      max: 3650,
    },
    /** Keep archived projects until retention window (days from archivedAt). */
    defaultRetentionDays: {
      type: Number,
      default: 365,
      min: 1,
      max: 3650,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
    /** Org working calendar — capacity/utilization (Phase ERP). */
    workingCalendar: {
      hoursPerDay: { type: Number, default: 8, min: 1, max: 24 },
      /** UTC weekday indexes: 0=Sun … 6=Sat; default Mon–Fri. */
      workingDayIndexes: {
        type: [Number],
        default: () => [1, 2, 3, 4, 5],
      },
      /** Billing convention (e.g. 20 × 8h = 160h/month). */
      billingDaysPerMonth: { type: Number, default: 20, min: 1, max: 31 },
    },
    holidays: [
      {
        date: { type: Date, required: true },
        name: { type: String, trim: true, default: '', maxlength: 120 },
      },
    ],
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GovernanceSettings', governanceSettingsSchema);
