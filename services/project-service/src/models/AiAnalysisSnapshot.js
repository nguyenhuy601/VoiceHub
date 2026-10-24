const mongoose = require('../db');

/**
 * Immutable Analysis Snapshot for AI Planning jobs.
 * Created when user selects an SRS pack; jobs read this instead of live DB.
 */
const aiAnalysisSnapshotSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    packId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RequirementPack',
      required: true,
      index: true,
    },
    packContentHash: { type: String, required: true, trim: true, maxlength: 64 },
    packVersionNumber: { type: Number, default: 1, min: 1 },
    templateVersion: { type: String, trim: true, default: '', maxlength: 16 },
    versions: {
      srs: { type: String, trim: true, default: '', maxlength: 64 },
      employee: { type: String, trim: true, default: '', maxlength: 64 },
      skill: { type: String, trim: true, default: '', maxlength: 64 },
      calendar: { type: String, trim: true, default: '', maxlength: 64 },
      pipeline: { type: Number, default: 1 },
    },
    sourcesResolved: { type: [mongoose.Schema.Types.Mixed], default: [] },
    projected: { type: mongoose.Schema.Types.Mixed, default: null },
    canonical: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Customer Raw Semantic Contract intake SoT (not canonicalizeProjected). */
    canonicalRaw: { type: mongoose.Schema.Types.Mixed, default: null },
    merged: { type: mongoose.Schema.Types.Mixed, default: null },
    commonFiltered: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Slim per-job prepared slices (ids + filterMeta) — preprocess artifacts for later AI/Tools */
    preparedByJob: { type: mongoose.Schema.Types.Mixed, default: null },
    ingestionValidation: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Planned-allocation hours by user/day in planning window — real data only, never invented. */
    bookedHoursByUserDay: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Forecast demand hours by user|week (budget+task+meeting) when FORECAST_CAPACITY_V1=1. */
    forecastDemandByUserWeek: { type: mongoose.Schema.Types.Mixed, default: null },
    /** MeetingPlan snapshot for HOW (orthogonal to booked commitment hours). */
    meetingPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    meetingDemandHoursByUserDay: { type: mongoose.Schema.Types.Mixed, default: null },
    effortEstimationConfigVersionId: { type: String, default: null, trim: true },
    /** Org master enabled project role keys frozen at snapshot create (HOW role allow-list). */
    enabledProjectRoleKeys: { type: [String], default: undefined },
    pipelineVersion: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['active', 'superseded'],
      default: 'active',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    supersededAt: { type: Date, default: null },
  },
  { timestamps: true }
);

aiAnalysisSnapshotSchema.index(
  { packId: 1, packContentHash: 1, status: 1 },
  { name: 'pack_hash_status' }
);
aiAnalysisSnapshotSchema.index({ organizationId: 1, packId: 1, createdAt: -1 });

module.exports = mongoose.model('AiAnalysisSnapshot', aiAnalysisSnapshotSchema);
