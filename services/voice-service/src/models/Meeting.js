const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 500,
      default: '',
    },
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    serverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Server',
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
    },
    participants: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        leftAt: {
          type: Date,
          default: null,
        },
        isMuted: {
          type: Boolean,
          default: false,
        },
        isVideoOn: {
          type: Boolean,
          default: false,
        },
      },
    ],
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'ended', 'cancelled'],
      default: 'scheduled',
    },
    meetingUrl: {
      type: String,
      default: null,
    },
    recordingUrl: {
      type: String,
      default: null,
    },
    isRecording: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
meetingSchema.index({ hostId: 1 });
meetingSchema.index({ serverId: 1 });
meetingSchema.index({ organizationId: 1 });
meetingSchema.index({ status: 1 });
meetingSchema.index({ startTime: 1 });

const Meeting = mongoose.model('Meeting', meetingSchema);

module.exports = Meeting;



