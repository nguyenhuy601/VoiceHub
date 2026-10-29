const mongoose = require('../db');

/**
 * sourceManifest — recurrence rule; instances are MeetingEvent with source=recurrence.
 */
const meetingRecurrenceRuleSchema = new mongoose.Schema(
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
    },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    /** RRULE-lite: weekly by weekday 0–6 UTC after org offset */
    freq: { type: String, enum: ['weekly'], default: 'weekly' },
    byWeekday: { type: Number, min: 0, max: 6, required: true },
    startTimeLocal: { type: String, required: true, trim: true, maxlength: 8 }, // HH:mm
    durationMinutes: { type: Number, min: 15, max: 480, default: 60 },
    rangeStart: { type: Date, required: true },
    rangeEnd: { type: Date, required: true },
    participantUserIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
    },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

meetingRecurrenceRuleSchema.index({ projectId: 1, active: 1 });

module.exports = mongoose.model('MeetingRecurrenceRule', meetingRecurrenceRuleSchema);
