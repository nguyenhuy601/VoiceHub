const mongoose = require('../db');

/**
 * Draft AI cho tạo dự án (P2) hoặc giao việc team (P2.5).
 * Human-in-the-loop: status ready → user confirm → confirmed.
 */
const aiBoardDraftSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ['project', 'team_assign'],
      required: true,
    },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: ['ready', 'confirming', 'confirmed', 'failed'],
      default: 'ready',
    },
    boardId: { type: mongoose.Schema.Types.ObjectId, default: null },
    listId: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** Toàn bộ draft JSON (board fields / card suggestions) */
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

aiBoardDraftSchema.index({ organizationId: 1, kind: 1, createdAt: -1 });
aiBoardDraftSchema.index({ generatedBy: 1, createdAt: -1 });

module.exports = mongoose.model('AiBoardDraft', aiBoardDraftSchema);
