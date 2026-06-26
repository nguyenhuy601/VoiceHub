const mongoose = require('../db');

const actionItemSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    assigneeHint: { type: String, default: '' },
    dueDateHint: { type: String, default: '' },
  },
  { _id: false }
);

const conversationSummarySchema = new mongoose.Schema(
  {
    generatedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, required: true },
    scope: { type: String, enum: ['org_channel', 'dm'], default: 'org_channel' },
    status: {
      type: String,
      enum: ['queued', 'processing', 'ready', 'failed'],
      default: 'queued',
    },
    error: { type: String, default: '' },
    threadKey: { type: String, required: true, index: true },
    sourceMeta: {
      messageCount: { type: Number, default: 0 },
      firstMessageId: { type: String, default: '' },
      lastMessageId: { type: String, default: '', index: true },
      exportedAt: { type: Date, default: null },
    },
    options: {
      unreadOnly: { type: Boolean, default: false },
      sinceMessageId: { type: String, default: '' },
      maxMessages: { type: Number, default: 200 },
    },
    result: {
      overview: { type: String, default: '' },
      keyPoints: { type: [String], default: [] },
      actionItems: { type: [actionItemSchema], default: [] },
      participants: { type: [String], default: [] },
      language: { type: String, default: 'vi' },
      messageRange: {
        fromMessageId: { type: String, default: '' },
        toMessageId: { type: String, default: '' },
        count: { type: Number, default: 0 },
      },
    },
    modelMeta: {
      provider: { type: String, default: '' },
      model: { type: String, default: '' },
      promptTokensApprox: { type: Number, default: null },
    },
    rawModelOutput: { type: mongoose.Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ConversationSummary', conversationSummarySchema);
