const mongoose = require('../db');

const meetingChangeHistorySchema = new mongoose.Schema(
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
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MeetingEvent',
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [
        'created',
        'updated',
        'rescheduled',
        'cancelled',
        'completed',
        'participant_changed',
        'conflict_override',
        'exceed_plan_ack',
      ],
      required: true,
    },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, trim: true, default: '', maxlength: 500 },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

meetingChangeHistorySchema.index({ eventId: 1, createdAt: -1 });

module.exports = mongoose.model('MeetingChangeHistory', meetingChangeHistorySchema);
