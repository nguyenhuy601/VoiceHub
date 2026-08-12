const mongoose = require('../db');

const meetingRecordingSegmentSchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Meeting',
      index: true,
    },
    segmentIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    audioStoragePath: {
      type: String,
      default: null,
    },
    tempStoragePath: {
      type: String,
      default: null,
    },
    durationSec: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['recording', 'processing', 'ready', 'failed', 'audio_expired'],
      default: 'recording',
    },
  },
  { timestamps: true }
);

meetingRecordingSegmentSchema.index({ meetingId: 1, segmentIndex: 1 }, { unique: true });

module.exports = mongoose.model('MeetingRecordingSegment', meetingRecordingSegmentSchema);
