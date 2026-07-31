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
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GovernanceSettings', governanceSettingsSchema);
