const mongoose = require('../db');

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
    /** Kênh voice workspace (roomId SFU = channelId) */
    voiceChannelId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    /** Mã phòng lobby tự do (vd. room-abc123) */
    lobbyRoomId: {
      type: String,
      default: null,
      trim: true,
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
    /** Path Opus trên MinIO, vd. meeting-recordings/room1/xxx.opus */
    audioStoragePath: {
      type: String,
      default: null,
    },
    transcript: {
      type: String,
      default: '',
    },
    transcriptChunks: [
      {
        seq: { type: Number, required: true },
        text: { type: String, default: '' },
        speakerId: { type: String, default: '' },
        displayName: { type: String, default: '' },
        at: { type: Date, default: Date.now },
      },
    ],
    transcriptSource: {
      type: String,
      enum: ['none', 'realtime', 'post_audio'],
      default: 'none',
    },
    summary: {
      type: String,
      default: '',
    },
    summaryStructured: {
      summary: { type: String, default: '' },
      keyPoints: [{ type: String }],
      actionItems: [{ type: String }],
    },
    summaryStatus: {
      type: String,
      enum: ['none', 'processing', 'ready', 'failed'],
      default: 'none',
    },
    aiSummaryEnabled: {
      type: Boolean,
      default: false,
    },
    recordingStatus: {
      type: String,
      enum: ['none', 'pending_upload', 'processing', 'ready', 'failed', 'audio_expired'],
      default: 'none',
    },
    durationSec: {
      type: Number,
      default: null,
    },
    /** Path WebM tạm trên MinIO (worker xóa sau transcode) */
    tempStoragePath: {
      type: String,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    /** Runtime: có phiên ghi âm đang active trong phòng (opt-in) */
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
meetingSchema.index({ voiceChannelId: 1, status: 1 });

const Meeting = mongoose.model('Meeting', meetingSchema);

module.exports = Meeting;



