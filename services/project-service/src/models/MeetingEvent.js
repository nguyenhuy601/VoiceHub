const mongoose = require('../db');

/**
 * MeetingEvent — concrete meeting instance (internal schedule ≠ customer ack).
 */
const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isExternal: { type: Boolean, default: false },
    externalName: { type: String, trim: true, default: '', maxlength: 120 },
    externalEmail: { type: String, trim: true, default: '', maxlength: 160 },
    externalCompany: { type: String, trim: true, default: '', maxlength: 120 },
    externalRole: { type: String, trim: true, default: '', maxlength: 80 },
    attendanceStatus: {
      type: String,
      enum: ['invited', 'accepted', 'declined', 'attended', 'no_show'],
      default: 'invited',
    },
    plannedDurationMinutes: { type: Number, min: 0, max: 24 * 60, default: null },
    actualDurationMinutes: { type: Number, min: 0, max: 24 * 60, default: null },
  },
  { _id: false }
);

const meetingEventSchema = new mongoose.Schema(
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
    title: { type: String, required: true, trim: true, maxlength: 240 },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'confirmed', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    /** Separate from internal status — RULE customer ack */
    customerExchangeStatus: {
      type: String,
      enum: ['n_a', 'not_contacted', 'awaiting', 'confirmed', 'declined'],
      default: 'n_a',
    },
    source: {
      type: String,
      enum: ['manual', 'recurrence', 'ai_draft', 'integration'],
      default: 'manual',
    },
    planLineWeekKey: { type: String, trim: true, default: '', maxlength: 16 },
    recurrenceRuleId: { type: String, trim: true, default: '', maxlength: 64 },
    recurrenceParentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MeetingEvent',
      default: null,
    },
    participants: { type: [participantSchema], default: [] },
    overrideReason: { type: String, trim: true, default: '', maxlength: 500 },
    exceedPlanAck: { type: Boolean, default: false },
    conflictOverrideReason: { type: String, trim: true, default: '', maxlength: 500 },
    cancelDisposition: {
      type: String,
      enum: ['', 'return_forecast', 'no_longer_needed', 'replaced'],
      default: '',
    },
    replacementEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MeetingEvent',
      default: null,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

meetingEventSchema.index({ projectId: 1, startAt: 1 });
meetingEventSchema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('MeetingEvent', meetingEventSchema);
