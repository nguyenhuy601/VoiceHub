const mongoose = require('../db');

/**
 * MeetingPlan — forecast meeting demand by week × role|user (not calendar events).
 */
const planLineSchema = new mongoose.Schema(
  {
    weekKey: { type: String, required: true, trim: true, maxlength: 16 },
    roleKey: { type: String, trim: true, default: '', maxlength: 64 },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    hours: { type: Number, required: true, min: 0, max: 80 },
    activityId: { type: String, trim: true, default: '', maxlength: 64 },
    source: {
      type: String,
      enum: ['org_config', 'ai_suggest', 'manual'],
      default: 'manual',
    },
  },
  { _id: false }
);

const meetingPlanSchema = new mongoose.Schema(
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
    version: { type: Number, required: true, min: 1, default: 1 },
    status: {
      type: String,
      enum: ['draft', 'confirmed', 'superseded'],
      default: 'draft',
      index: true,
    },
    configVersionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    lines: { type: [planLineSchema], default: [] },
    timezone: { type: String, trim: true, default: 'Asia/Ho_Chi_Minh', maxlength: 64 },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

meetingPlanSchema.index({ projectId: 1, version: 1 }, { unique: true });
meetingPlanSchema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('MeetingPlan', meetingPlanSchema);
