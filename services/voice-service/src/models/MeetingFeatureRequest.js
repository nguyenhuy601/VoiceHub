const { mongo } = require('@enterprise/shared');
const { mongoose } = mongo;

const meetingFeatureRequestSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    displayName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    type: {
      type: String,
      enum: ['recording', 'ai_summary'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

meetingFeatureRequestSchema.index({ roomId: 1, userId: 1, type: 1, status: 1 });

module.exports = mongoose.model('MeetingFeatureRequest', meetingFeatureRequestSchema);
