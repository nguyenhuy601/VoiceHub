const mongoose = require('../db');

const taskBoardListSchema = new mongoose.Schema(
  {
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    /** Phase 4 — map cột ↔ WorkflowStatus.key (dual-read với title). */
    statusKey: {
      type: String,
      trim: true,
      default: '',
      maxlength: 64,
      index: true,
    },
    order: {
      type: Number,
      required: true,
      default: 1000,
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

taskBoardListSchema.index({ boardId: 1, isArchived: 1, order: 1, createdAt: 1 });

module.exports = mongoose.model('TaskBoardList', taskBoardListSchema);
